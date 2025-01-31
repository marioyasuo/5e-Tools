"use strict";

class FilterUtil {}
FilterUtil.SUB_HASH_PREFIX_LENGTH = 4;

class PageFilter {
	static defaultSourceSelFn (val) {
		return !SourceUtil.isNonstandardSource(val);
	}

	constructor () {
		this._sourceFilter = SourceFilter.getInstance();

		this._filterBox = null;
	}

	get filterBox () { return this._filterBox; }
	get sourceFilter () { return this._sourceFilter; }

	mutateAndAddToFilters (entity, isExcluded) {
		this.mutateForFilters(entity);
		this.addToFilters(entity, isExcluded);
	}

	mutateForFilters (entity) { throw new Error("Unimplemented!"); }
	addToFilters (entity, isExcluded) { throw new Error("Unimplemented!"); }
	toDisplay (values, entity) { throw new Error("Unimplemented!"); }
	async _pPopulateBoxOptions () { throw new Error("Unimplemented!"); }

	async pInitFilterBox (opts) {
		await this._pPopulateBoxOptions(opts);
		this._filterBox = new FilterBox(opts);
		await this._filterBox.pDoLoadState();
		return this._filterBox;
	}
}

class ModalFilter {
	static _$getFilterColumnHeaders (btnMeta) {
		return btnMeta.map((it, i) => $(`<button class="col-${it.width} ${i === 0 ? "pl-0" : i === btnMeta.length ? "pr-0" : ""} sort btn btn-default btn-xs" data-sort="${it.sort}" ${it.title ? `title="${it.title}"` : ""}>${it.text} <span class="caret_wrp"></span></button>`));
	}

	/**
	 * (Public method for Plutonium use)
	 * Handle doing a checkbox-based selection toggle on a list.
	 * @param list
	 * @param item List item. Must have a "data" property with a "cbSel" (the checkbox).
	 * @param evt Click event.
	 * @param [opts] Options object.
	 * @param [opts.isNoHighlightSelection] If highlighting selected rows should be skipped.
	 * @param [opts.fnOnSelectionChange] Function to call when selection status of an item changes.
	 */
	static handleSelectClick (list, item, evt, opts) {
		opts = opts || {};
		evt.preventDefault();
		evt.stopPropagation();

		if (evt && evt.shiftKey && list.__firstListSelection && list.__firstListSelection !== item) {
			// on a shift-click, toggle all the checkboxes to the value of the first selected one
			// if it's a _further_ shift-click, toggle the range to the opposite of whatever the target box was...

			const setTo = list.__lastListSelection
				? item.data.cbSel ? !item.data.cbSel.checked : false
				: list.__firstListSelection.data.cbSel ? list.__firstListSelection.data.cbSel.checked : false;

			const ix1 = list.visibleItems.indexOf(list.__firstListSelection);
			const ix2 = list.visibleItems.indexOf(item);

			const [ixStart, ixEnd] = [ix1, ix2].sort(SortUtil.ascSort);
			for (let i = ixStart; i <= ixEnd; ++i) {
				const it = list.visibleItems[i];

				//   ...except for the first item, which gets left at whatever it was set to
				if (list.__lastListSelection && it === list.__firstListSelection) continue;

				if (it.data.cbSel) {
					it.data.cbSel.checked = setTo;
					if (opts.fnOnSelectionChange) opts.fnOnSelectionChange(it, setTo);
				}

				if (!opts.isNoHighlightSelection) {
					if (setTo) it.ele.classList.add("list-multi-selected");
					else it.ele.classList.remove("list-multi-selected");
				}
			}

			list.__lastListSelection = item;
		} else {
			// on a normal click, or if there's been no initial selection, just toggle the checkbox

			if (item.data.cbSel) {
				item.data.cbSel.checked = !item.data.cbSel.checked;

				if (opts.fnOnSelectionChange) opts.fnOnSelectionChange(item, item.data.cbSel.checked);

				if (!opts.isNoHighlightSelection) {
					if (item.data.cbSel.checked) item.ele.classList.add("list-multi-selected");
					else item.ele.classList.remove("list-multi-selected");
				}
			} else {
				if (!opts.isNoHighlightSelection) {
					item.ele.classList.remove("list-multi-selected");
				}
			}

			list.__firstListSelection = item;
			list.__lastListSelection = null;
		}
	}

	/**
	 * (Public method for Plutonium use)
	 */
	static bindSelectAllCheckbox ($cbAll, list) {
		$cbAll.change(() => {
			const isChecked = $cbAll.prop("checked");
			list.visibleItems.forEach(it => {
				if (it.data.cbSel) it.data.cbSel.checked = isChecked;

				if (isChecked) it.ele.classList.add("list-multi-selected");
				else it.ele.classList.remove("list-multi-selected");
			});
		});
	}

	/**
	 * @param opts Options object.
	 * @param opts.modalTitle
	 * @param opts.fnSort
	 * @param opts.pageFilter
	 * @param [opts.namespace]
	 */
	constructor (opts) {
		this._modalTitle = opts.modalTitle;
		this._fnSort = opts.fnSort;
		this._pageFilter = opts.pageFilter;
		this._namespace = opts.namespace;

		this._filterCache = null;
	}

	async pGetUserSelection () {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			let $wrpModalInner;

			const {$modalInner, doClose} = UiUtil.getShowModal({
				fullHeight: true,
				title: `Filter/Search for ${this._modalTitle}`,
				cbClose: (isDataEntered) => {
					$wrpModalInner.detach();
					if (!isDataEntered) resolve([]);
				},
				isLarge: true,
				zIndex: 999
			});

			if (this._filterCache) {
				$wrpModalInner = this._filterCache.$wrpModalInner.appendTo($modalInner);
			} else {
				await this._pInit();

				const $ovlLoading = $(`<div class="w-100 h-100 flex-vh-center"><i class="dnd-font text-muted">Loading...</i></div>`).appendTo($modalInner);

				const $iptSearch = $(`<input class="form-control" type="search" placeholder="Search...">`);
				const $btnReset = $(`<button class="btn btn-default">Reset</button>`);
				const $wrpFormTop = $$`<div class="flex input-group btn-group w-100 lst__form-top">${$iptSearch}${$btnReset}</div>`;

				const $wrpFormBottom = $(`<div class="w-100"/>`);

				const $wrpFormHeaders = $(`<div class="sortlabel lst__form-bottom"/>`);
				const $cbSelAll = $(`<input type="checkbox">`);

				$$`<label class="btn btn-default col-1 flex-vh-center">${$cbSelAll}</label>`.appendTo($wrpFormHeaders);
				this._$getColumnHeaders().forEach($ele => $wrpFormHeaders.append($ele));

				const $wrpForm = $$`<div class="flex-col w-100 mb-2">${$wrpFormTop}${$wrpFormBottom}${$wrpFormHeaders}</div>`;
				const $wrpList = $(`<ul class="list mb-2 h-100"/>`);

				const $btnConfirm = $(`<button class="btn btn-default">Confirm</button>`);

				const list = new List({
					$iptSearch,
					$wrpList,
					fnSort: this._fnSort
				});

				ModalFilter.bindSelectAllCheckbox($cbSelAll, list);
				SortUtil.initBtnSortHandlers($wrpFormHeaders, list);

				const allData = await this._pLoadAllData();
				const pageFilter = this._pageFilter;

				await pageFilter.pInitFilterBox({
					$wrpFormTop,
					$btnReset,
					$wrpMiniPills: $wrpFormBottom,
					namespace: this._namespace
				});

				allData.forEach((it, i) => {
					pageFilter.mutateAndAddToFilters(it);
					const filterListItem = this._getListItem(pageFilter, it, i);
					list.addItem(filterListItem);
					filterListItem.ele.addEventListener("click", evt => ModalFilter.handleSelectClick(list, filterListItem, evt));
				});

				list.init();
				list.update();

				const handleFilterChange = () => {
					const f = pageFilter.filterBox.getValues();
					list.filter(li => {
						const it = allData[li.ix];
						return pageFilter.toDisplay(f, it);
					});
				};

				$(pageFilter.filterBox).on(FilterBox.EVNT_VALCHANGE, handleFilterChange);
				pageFilter.filterBox.render();
				handleFilterChange();

				$ovlLoading.remove();

				$wrpModalInner = $$`<div class="flex-col h-100">
					${$wrpForm}
					${$wrpList}
					<div class="flex-vh-center">${$btnConfirm}</div>
				</div>`.appendTo($modalInner);

				this._filterCache = {$wrpModalInner, $btnConfirm, pageFilter, list, $cbSelAll};
			}

			this._filterCache.$btnConfirm.off("click").click(async () => {
				const checked = this._filterCache.list.visibleItems.filter(it => it.data.cbSel.checked);
				resolve(checked);

				doClose(true);

				// region reset selection state
				this._filterCache.$cbSelAll.prop("checked", false);
				this._filterCache.list.items.forEach(it => {
					if (it.data.cbSel) it.data.cbSel.checked = false;
					it.ele.classList.remove("list-multi-selected");
				});
				// endregion
			});
		});
	}

	_$getColumnHeaders () { throw new Error(`Unimplemented!`); }
	async _pInit () { /* Implement as required */ }
	async _pLoadAllData () { throw new Error(`Unimplemented!`); }
	async _getListItem () { throw new Error(`Unimplemented!`); }
}

class FilterBox extends ProxyBase {
	static selectFirstVisible (entryList) {
		if (Hist.lastLoadedId == null && !Hist.initialLoad) {
			Hist._freshLoad();
		}

		// This version deemed too annoying to be of practical use
		//  Instead of always loading the URL, this would switch to the first visible item that matches the filter
		/*
		if (Hist.lastLoadedId && !Hist.initialLoad) {
			const last = entryList[Hist.lastLoadedId];
			const lastHash = UrlUtil.autoEncodeHash(last);
			const link = $("#listcontainer").find(`.list a[href="#${lastHash.toLowerCase()}"]`);
			if (!link.length) Hist._freshLoad();
		} else if (Hist.lastLoadedId == null && !Hist.initialLoad) {
			Hist._freshLoad();
		}
		*/
	}

	/**
	 * @param opts Options object.
	 * @param [opts.$wrpFormTop] Form input group.
	 * @param opts.$btnReset Form reset button.
	 * @param [opts.$btnOpen] A custom button to use to open the filter overlay.
	 * @param [opts.$iptSearch] Search input associated with the "form" this filter is a part of. Only used for passing
	 * through search terms in @filter tags.
	 * @param [opts.$wrpMiniPills] Element to house mini pills.
	 * @param opts.filters Array of filters to be included in this box.
	 * @param [opts.isCompact] True if this box should have a compact/reduced UI.
	 * @param [opts.namespace] Namespace for this filter, to prevent collisions with other filters on the same page.
	 */
	constructor (opts) {
		super();

		this._$iptSearch = opts.$iptSearch;
		this._$wrpFormTop = opts.$wrpFormTop;
		this._$btnReset = opts.$btnReset;
		this._$btnOpen = opts.$btnOpen;
		this._$wrpMiniPills = opts.$wrpMiniPills;
		this._filters = opts.filters;
		this._isCompact = opts.isCompact;
		this._namespace = opts.namespace;

		this._doSaveStateDebounced = MiscUtil.debounce(() => this._pDoSaveState(), 50);
		this.__meta = this._getDefaultMeta();
		if (this._isCompact) this.__meta.isSummaryHidden = true;

		this._meta = this._getProxy("meta", this.__meta);
		this.__minisHidden = {};
		this._minisHidden = this._getProxy("minisHidden", this.__minisHidden);
		this.__combineAs = {};
		this._combineAs = this._getProxy("combineAs", this.__combineAs);
		this._$body = $(`body`);
		this._$overlay = null;

		this._cachedState = null;

		this._filters.forEach(f => f.filterBox = this);
	}

	_getNamespacedStorageKey () { return `${FilterBox._STORAGE_KEY}${this._namespace ? `.${this._namespace}` : ""}` }
	getNamespacedHashKey (k) { return `${k || "_".repeat(FilterUtil.SUB_HASH_PREFIX_LENGTH)}${this._namespace ? `.${this._namespace}` : ""}`; }

	async pGetStoredActiveSources () {
		const stored = await StorageUtil.pGetForPage(this._getNamespacedStorageKey());
		if (stored) {
			const sourceFilterData = stored.filters[FilterBox.SOURCE_HEADER];
			if (sourceFilterData) {
				const state = sourceFilterData.state;
				const blue = [];
				const white = [];
				Object.entries(state).forEach(([src, mode]) => {
					if (mode === 1) blue.push(src);
					else if (mode !== -1) white.push(src);
				});
				if (blue.length) return blue; // if some are selected, we load those
				else return white; // otherwise, we load non-red
			}
		}
		return null;
	}

	registerMinisHiddenHook (prop, hook) {
		this._addHook("minisHidden", prop, hook);
	}

	isMinisHidden (header) {
		return !!this._minisHidden[header];
	}

	async pDoLoadState () {
		const toLoad = await StorageUtil.pGetForPage(this._getNamespacedStorageKey());
		if (toLoad != null) this._setStateFromLoaded(toLoad);
	}

	_setStateFromLoaded (state) {
		state.box = state.box || {};
		this._proxyAssign("meta", "_meta", "__meta", state.box.meta || {}, true);
		this._proxyAssign("minisHidden", "_minisHidden", "__minisHidden", state.box.minisHidden || {}, true);
		this._proxyAssign("combineAs", "_combineAs", "__combineAs", state.box.combineAs || {}, true);
		this._filters.forEach(it => it.setStateFromLoaded(state.filters));
	}

	_getSaveableState () {
		const filterOut = {};
		this._filters.forEach(it => Object.assign(filterOut, it.getSaveableState()));
		return {
			box: {
				meta: {...this.__meta},
				minisHidden: {...this.__minisHidden},
				combineAs: {...this.__combineAs}
			},
			filters: filterOut
		};
	}

	async _pDoSaveState () {
		await StorageUtil.pSetForPage(this._getNamespacedStorageKey(), this._getSaveableState());
	}

	render () {
		if (this._$overlay) {
			// already rendered previously; simply update the filters
			this._filters.map(f => f.update());
		} else {
			this._$overlay = this._render_$getOverlay();
			if (!this._$wrpMiniPills) {
				this._$wrpMiniPills = $(`<div class="fltr__mini-view btn-group"/>`).insertAfter(this._$wrpFormTop);
			} else {
				this._$wrpMiniPills.addClass("fltr__mini-view");
			}

			const $children = this._filters.map((f, i) => f.$render({filterBox: this, isFirst: i === 0, $wrpMini: this._$wrpMiniPills}));

			const $btnShowAllFilters = $(`<button class="btn btn-xs btn-default">Show All</button>`)
				.click(() => this.showAllFilters());
			const $btnHideAllFilters = $(`<button class="btn btn-xs btn-default">Hide All</button>`)
				.click(() => this.hideAllFilters());

			const $btnReset = $(`<button class="btn btn-xs btn-default mr-3" title="Reset filters. SHIFT to reset everything.">Reset</button>`)
				.click(evt => this.reset(evt.shiftKey));

			const $btnSettings = $(`<button class="btn btn-xs btn-default mr-3"><span class="glyphicon glyphicon-cog"/></button>`)
				.click(() => this._openSettingsModal());

			const $btnSaveAlt = $(`<button class="btn btn-xs btn-primary" title="Save"><span class="glyphicon glyphicon-ok"/></button>`)
				.click(() => this.pHide());

			const $wrpBtnCombineFilters = $(`<div class="btn-group mr-3"></div>`);
			const $btnCombineFilterSettings = $(`<button class="btn btn-xs btn-default"><span class="glyphicon glyphicon-cog"/></button>`)
				.click(() => this._openCombineAsModal());

			const $btnCombineFiltersAs = $(`<button class="btn btn-xs btn-default"/>`)
				.appendTo($wrpBtnCombineFilters)
				.click(() => this._meta.modeCombineFilters = FilterBox._COMBINE_MODES.getNext(this._meta.modeCombineFilters));
			const hook = () => {
				$btnCombineFiltersAs.text(this._meta.modeCombineFilters === "custom" ? this._meta.modeCombineFilters.uppercaseFirst() : this._meta.modeCombineFilters.toUpperCase());
				if (this._meta.modeCombineFilters === "custom") $wrpBtnCombineFilters.append($btnCombineFilterSettings);
				else $btnCombineFilterSettings.detach();
				this._doSaveStateDebounced();
			};
			this._addHook("meta", "modeCombineFilters", hook);
			hook();

			const $btnSave = $(`<button class="btn btn-primary fltr__btn-close mr-2">Save</button>`)
				.click(() => this.pHide());

			const $btnCancel = $(`<button class="btn btn-default fltr__btn-close">Cancel</button>`)
				.click(() => this.pHide(true));

			$$`<div class="ui-modal__inner flex-col ui-modal__inner--large dropdown-menu">
			<div class="split mb-2 mt-2 flex-v-center mobile__flex-col">
				<h4 class="m-0 mobile__mb-2">Filters</h4>
				<div class="flex-v-center mobile__flex-col">
					<div class="flex-v-center mobile__m-1">
						<div class="mr-2">Combine as</div>
						${$wrpBtnCombineFilters}
					</div>
					<div class="flex-v-center mobile__m-1">
						<div class="btn-group mr-2">
							${$btnShowAllFilters}
							${$btnHideAllFilters}
						</div>
						${$btnReset}
						${$btnSettings}
						${$btnSaveAlt}
					</div>
				</div>
			</div>
			<hr class="w-100 m-0 mb-2">

			<hr class="mt-1 mb-1">
			<div class="ui-modal__scroller smooth-scroll px-1">
				${$children}
			</div>
			<hr class="my-1 w-100">
			<div class="w-100 flex-vh-center my-1">${$btnSave}${$btnCancel}</div>
			</div>`
				.click((evt) => evt.stopPropagation())
				.appendTo(this._$overlay);

			if (this._$btnReset) {
				this._$btnReset
					.title("Reset filters. SHIFT to reset everything.")
					.click((evt) => this.reset(evt.shiftKey));
			}

			const $btnToggleSummaryHidden = $(`<button class="btn btn-default ${this._isCompact ? "p-2" : ""}" title="Toggle Filter Summary Display"><span class="glyphicon glyphicon-resize-small"/></button>`)
				.click(() => {
					this._meta.isSummaryHidden = !this._meta.isSummaryHidden;
					this._doSaveStateDebounced();
				})
				.prependTo(this._$wrpFormTop);
			const summaryHiddenHook = () => {
				$btnToggleSummaryHidden.toggleClass("active", !!this._meta.isSummaryHidden);
				this._$wrpMiniPills.toggleClass("ve-hidden", !!this._meta.isSummaryHidden);
			};
			this._addHook("meta", "isSummaryHidden", summaryHiddenHook);
			summaryHiddenHook();

			if (this._$btnOpen) this._$btnOpen.click(() => this.show());
			else {
				$(`<button class="btn btn-default ${this._isCompact ? "px-2" : ""}">Filter</button>`)
					.click(() => this.show())
					.prependTo(this._$wrpFormTop);
			}

			const sourceFilter = this._filters.find(it => it.header === FilterBox.SOURCE_HEADER);
			if (sourceFilter) {
				const selFnAlt = (val) => !SourceUtil.isNonstandardSource(val) && !BrewUtil.hasSourceJson(val);
				const hkSelFn = () => {
					if (this._meta.isBrewDefaultHidden) sourceFilter.setTempFnSel(selFnAlt);
					else sourceFilter.setTempFnSel(null);
					sourceFilter.updateMiniPillClasses();
				};
				this._addHook("meta", "isBrewDefaultHidden", hkSelFn);
				hkSelFn();
			}
		}
	}

	_render_$getOverlay () {
		return $(`<div class="modal__wrp modal__wrp--no-centre"/>`).hide().appendTo(this._$body)
			.click(() => this.pHide(true));
	}

	_openSettingsModal () {
		const {$modalInner} = UiUtil.getShowModal({title: "Settings"});
		UiUtil.$getAddModalRowCb($modalInner, "Deselect Homebrew Sources by Default", this._meta, "isBrewDefaultHidden");
		UiUtil.addModalSep($modalInner);
		UiUtil.$getAddModalRowHeader($modalInner, "Hide summary for filter...", {helpText: "The summary is the small red and blue button panel which appear below the search bar."});
		this._filters.forEach(f => UiUtil.$getAddModalRowCb($modalInner, f.header, this._minisHidden, f.header));
	}

	_openCombineAsModal () {
		const {$modalInner} = UiUtil.getShowModal({title: "Filter Combination Logic"});
		const $btnReset = $(`<button class="btn btn-xs btn-default">Reset</button>`)
			.click(() => {
				Object.keys(this._combineAs).forEach(k => this._combineAs[k] = "and");
				$sels.forEach($sel => $sel.val("0"));
			});
		UiUtil.$getAddModalRowHeader($modalInner, "Combine filters as...", {$eleRhs: $btnReset});
		const $sels = this._filters.map(f => UiUtil.$getAddModalRowSel($modalInner, f.header, this._combineAs, f.header, ["and", "or"], {fnDisplay: (it) => it.toUpperCase()}));
	}

	getValues () {
		const outObj = {};
		this._filters.forEach(f => Object.assign(outObj, f.getValues()));
		return outObj;
	}

	addEventListener (type, listener) {
		(this._$wrpFormTop ? this._$wrpFormTop[0] : this._$btnOpen[0]).addEventListener(type, listener);
	}

	_reset_meta () {
		Object.assign(this._meta, this._getDefaultMeta());
	}

	_reset_minisHidden () {
		Object.keys(this._minisHidden).forEach(k => this._minisHidden[k] = false);
	}

	_reset_combineAs () {
		Object.keys(this._combineAs).forEach(k => this._combineAs[k] = "and");
	}

	reset (isResetAll) {
		this._filters.forEach(f => f.reset(isResetAll));
		if (isResetAll) {
			this._reset_meta();
			this._reset_minisHidden();
			this._reset_combineAs();
		}
		this.render();
		this.fireChangeEvent();
	}

	show () {
		this._cachedState = this._getSaveableState();
		this._$body.css("overflow", "hidden");
		this._$overlay.show();
	}

	async pHide (isCancel = false) {
		if (this._cachedState && isCancel) {
			const curState = this._getSaveableState();
			const hasChanges = !CollectionUtil.deepEquals(curState, this._cachedState);

			this._$body.css("overflow", "");
			this._$overlay.hide();

			if (hasChanges) {
				const isSave = await InputUiUtil.pGetUserBoolean({
					title: "Unsaved Changes",
					textYes: "Save",
					textNo: "Discard"
				});
				if (isSave) {
					this._cachedState = null;
					this.fireChangeEvent();
					return;
				} else this._setStateFromLoaded(this._cachedState);
			}
		} else {
			this._$body.css("overflow", "");
			this._$overlay.hide();
			this.fireChangeEvent();
		}

		this._cachedState = null;
	}

	showAllFilters () {
		this._filters.forEach(f => f.show());
	}

	hideAllFilters () {
		this._filters.forEach(f => f.hide());
	}

	setFromSubHashes (subHashes, force = false) {
		const unpacked = {};
		subHashes.forEach(s => {
			const unpackedPart = UrlUtil.unpackSubHash(s, true);
			if (Object.keys(unpackedPart).length > 1) throw new Error(`Multiple keys in subhash!`);
			const k = Object.keys(unpackedPart)[0];
			unpackedPart[k] = {clean: unpackedPart[k], raw: s};
			Object.assign(unpacked, unpackedPart);
		});
		const urlHeaderToFilter = {};
		this._filters.forEach(f => {
			const childFilters = f.getChildFilters();
			if (childFilters.length) childFilters.forEach(f => urlHeaderToFilter[f.header.toLowerCase()] = f);
			urlHeaderToFilter[f.header.toLowerCase()] = f;
		});
		const updatedUrlHeaders = new Set();
		const consumed = new Set();
		let filterInitialSearch;

		const filterBoxState = {};
		const statePerFilter = {};
		const prefixLen = this.getNamespacedHashKey().length;
		Object.entries(unpacked)
			.forEach(([hashKey, data]) => {
				const rawPrefix = hashKey.substring(0, prefixLen);
				const prefix = rawPrefix.substring(0, FilterUtil.SUB_HASH_PREFIX_LENGTH);

				const urlHeader = hashKey.substring(prefixLen);

				// special case for the "search" keyword
				if (urlHeader === "search") {
					filterInitialSearch = data.clean[0];
					consumed.add(data.raw);
					return;
				}

				if (FilterUtil.SUB_HASH_PREFIXES.has(prefix) && urlHeaderToFilter[urlHeader]) {
					(statePerFilter[urlHeader] = statePerFilter[urlHeader] || {})[prefix] = data.clean;
					updatedUrlHeaders.add(urlHeader);
					consumed.add(data.raw);
				} else if (Object.values(FilterBox._SUB_HASH_PREFIXES).includes(prefix)) {
					filterBoxState[prefix] = data.clean;
					consumed.add(data.raw);
				} else if (FilterUtil.SUB_HASH_PREFIXES.has(prefix)) throw new Error(`Could not find filter with header ${urlHeader} for subhash ${data.raw}`)
			});

		if (consumed.size || force) {
			this._setFromSubHashState(urlHeaderToFilter, filterBoxState);

			Object.entries(statePerFilter).forEach(([urlHeader, state]) => {
				const filter = urlHeaderToFilter[urlHeader];
				filter.setFromSubHashState(state);
			});

			// reset any other state/meta state/etc
			Object.keys(urlHeaderToFilter)
				.filter(k => !updatedUrlHeaders.has(k))
				.forEach(k => {
					const filter = urlHeaderToFilter[k];
					filter.resetShallow(true);
				});

			const [link] = Hist.getHashParts();

			const outSub = [];
			Object.values(unpacked)
				.filter(v => !consumed.has(v.raw))
				.forEach(v => outSub.push(v.raw));

			Hist.setSuppressHistory(true);
			window.history.replaceState(
				{},
				document.title,
				`${location.origin}${location.pathname}#${link}${outSub.length ? `${HASH_PART_SEP}${outSub.join(HASH_PART_SEP)}` : ""}`
			);

			if (filterInitialSearch && this._$iptSearch) this._$iptSearch.val(filterInitialSearch).change().keydown().keyup();
			this.fireChangeEvent();
			Hist.hashChange();
			return outSub;
		} else return subHashes;
	}

	_setFromSubHashState (urlHeaderToFilter, filterBoxState) {
		let hasMeta = false;
		let hasMinisHidden = false;
		let hasCombineAs = false;

		Object.entries(filterBoxState).forEach(([k, vals]) => {
			const mappedK = this.getNamespacedHashKey(Parser._parse_bToA(FilterBox._SUB_HASH_PREFIXES, k));
			switch (mappedK) {
				case "meta": {
					hasMeta = true;
					const data = vals.map(v => UrlUtil.mini.decompress(v));
					Object.keys(this._getDefaultMeta()).forEach((k, i) => this._meta[k] = data[i]);
					break;
				}
				case "minisHidden": {
					hasMinisHidden = true;
					Object.keys(this._minisHidden).forEach(k => this._minisHidden[k] = false);
					vals.forEach(v => {
						const [urlHeader, isHidden] = v.split("=");
						const filter = urlHeaderToFilter[urlHeader];
						if (!filter) throw new Error(`Could not find filter with name "${urlHeader}"`);
						this._minisHidden[filter.header] = !!Number(isHidden);
					});
					break;
				}
				case "combineAs": {
					hasCombineAs = true;
					Object.keys(this._combineAs).forEach(k => this._combineAs[k] = "and");
					vals.forEach(v => {
						const [urlHeader, ixCombineMode] = v.split("=");
						const filter = urlHeaderToFilter[urlHeader];
						if (!filter) throw new Error(`Could not find filter with name "${urlHeader}"`);
						this._combineAs[filter.header] = FilterBox._COMBINE_MODES[ixCombineMode] || FilterBox._COMBINE_MODES[0];
					});
					break;
				}
			}
		});

		if (!hasMeta) this._reset_meta();
		if (!hasMinisHidden) this._reset_minisHidden();
		if (!hasCombineAs) this._reset_combineAs();
	}

	getSubHashes () {
		const out = [];
		const boxSubHashes = this.getBoxSubHashes();
		if (boxSubHashes) out.push(boxSubHashes);
		out.push(...this._filters.map(f => f.getSubHashes()).filter(Boolean));
		return out.flat();
	}

	getBoxSubHashes () {
		const out = [];

		const defaultMeta = this._getDefaultMeta();

		// serialize base meta in a set order
		const anyNotDefault = Object.keys(defaultMeta).find(k => this._meta[k] !== defaultMeta[k]);
		if (anyNotDefault) {
			const serMeta = Object.keys(defaultMeta).map(k => UrlUtil.mini.compress(this._meta[k] === undefined ? defaultMeta[k] : this._meta[k]));
			out.push(UrlUtil.packSubHash(this._getSubhashPrefix("meta"), serMeta));
		}

		// serialize minisHidden as `key=value` pairs
		const setMinisHidden = Object.entries(this._minisHidden).filter(([k, v]) => !!v).map(([k]) => `${k.toUrlified()}=1`);
		if (setMinisHidden.length) {
			out.push(UrlUtil.packSubHash(this._getSubhashPrefix("minisHidden"), setMinisHidden));
		}

		// serialize combineAs as `key=value` pairs
		const setCombineAs = Object.entries(this._combineAs).filter(([k, v]) => v !== FilterBox._COMBINE_MODES[0]).map(([k, v]) => `${k.toUrlified()}=${FilterBox._COMBINE_MODES.indexOf(v)}`);
		if (setCombineAs.length) {
			out.push(UrlUtil.packSubHash(this._getSubhashPrefix("combineAs"), setCombineAs));
		}

		return out.length ? out : null;
	}

	setFromValues (values) {
		this._filters.forEach(it => it.setFromValues(values));
	}

	toDisplay (boxState, ...entryVals) {
		const isAndDisplay = (filters, vals = entryVals) => {
			return filters
				.map((f, i) => f.toDisplay(boxState, vals[i]))
				.every(it => it);
		};

		const isOrDisplay = (filters, vals = entryVals) => {
			const res = filters.map((f, i) => {
				// filter out "ignored" filter (i.e. all white)
				if (!f.isActive(boxState)) return null;
				return f.toDisplay(boxState, vals[i]);
			}).filter(it => it != null);
			return res.length === 0 || res.find(it => it);
		};

		switch (this._meta.modeCombineFilters) {
			case "and": return isAndDisplay(this._filters);
			case "or": return isOrDisplay(this._filters);
			case "custom": {
				const andFilters = [];
				const andValues = [];
				const orFilters = [];
				const orValues = [];

				if (entryVals.length !== this._filters.length) throw new Error(`Number of filters and number of values did not match!`);
				for (let i = 0; i < this._filters.length; ++i) {
					const f = this._filters[i];
					if (!this._combineAs[f.header] || this._combineAs[f.header] === "and") { // default to "and" if undefined
						andFilters.push(f);
						andValues.push(entryVals[i])
					} else {
						orFilters.push(f);
						orValues.push(entryVals[i])
					}
				}

				return isAndDisplay(andFilters, andValues) && isOrDisplay(orFilters, orValues);
			}
			default: throw new Error(`Unhandled combining mode "${this._meta.modeCombineFilters}"`);
		}
	}

	fireChangeEvent () {
		this._doSaveStateDebounced();
		const eventOut = new Event(FilterBox.EVNT_VALCHANGE);
		(this._$wrpFormTop ? this._$wrpFormTop[0] : this._$btnOpen[0]).dispatchEvent(eventOut);
	}

	_getSubhashPrefix (prop) {
		if (FilterBox._SUB_HASH_PREFIXES[prop]) return this.getNamespacedHashKey(FilterBox._SUB_HASH_PREFIXES[prop]);
		throw new Error(`Unknown property "${prop}"`);
	}

	_getDefaultMeta () {
		const out = MiscUtil.copy(FilterBox._DEFAULT_META);
		if (this._isCompact) out.isSummaryHidden = true;
		return out;
	}
}
FilterBox.EVNT_VALCHANGE = "valchange";
FilterBox.SOURCE_HEADER = "Source";
FilterBox._PILL_STATES = ["ignore", "yes", "no"];
FilterBox._COMBINE_MODES = ["and", "or", "custom"];
FilterBox._STORAGE_KEY = "filterBoxState";
FilterBox._DEFAULT_META = {
	modeCombineFilters: "and",
	isSummaryHidden: false,
	isBrewDefaultHidden: false
};

// These are assumed to be the same length (4 characters)
FilterBox._SUB_HASH_BOX_META_PREFIX = "fbmt";
FilterBox._SUB_HASH_BOX_MINIS_HIDDEN_PREFIX = "fbmh";
FilterBox._SUB_HASH_BOX_COMBINE_AS_PREFIX = "fbca";
FilterBox._SUB_HASH_PREFIXES = {
	meta: FilterBox._SUB_HASH_BOX_META_PREFIX,
	minisHidden: FilterBox._SUB_HASH_BOX_MINIS_HIDDEN_PREFIX,
	combineAs: FilterBox._SUB_HASH_BOX_COMBINE_AS_PREFIX
};

class FilterItem {
	/**
	 * An alternative to string `Filter.items` with a change-handling function
	 * @param options containing:
	 * @param options.item the item string
	 * @param [options.pFnChange] (optional) function to call when filter is changed
	 * @param [options.group] (optional) group this item belongs to.
	 * @param [options.nest] (optional) nest this item belongs to
	 * @param [options.nestHidden] (optional) if nested, default visibility state
	 * @param [options.isIgnoreRed] (optional) if this item should be ignored when negative filtering
	 * @param [options.userData] (optional) extra data to be stored as part of the item
	 */
	constructor (options) {
		this.item = options.item;
		this.pFnChange = options.pFnChange;
		this.group = options.group;
		this.nest = options.nest;
		this.nestHidden = options.nestHidden;
		this.isIgnoreRed = options.isIgnoreRed;
		this.userData = options.userData;

		this.$rendered = null;
	}
}

class FilterBase extends BaseComponent {
	constructor (opts) {
		super();
		this._filterBox = null;

		this.header = opts.header;

		this.__meta = {...this.getDefaultMeta()};
		this._meta = this._getProxy("meta", this.__meta);
	}

	set filterBox (it) { this._filterBox = it; }

	show () { this._meta.isHidden = false; }

	hide () { this._meta.isHidden = true; }

	getBaseSaveableState () { return {meta: {...this.__meta}}; }

	resetBase () {
		Object.assign(this._meta, MiscUtil.copy(this.getDefaultMeta()));
	}

	getMetaSubHashes () {
		const anyNotDefault = Object.keys(FilterBase._DEFAULT_META).find(k => this._meta[k] !== FilterBase._DEFAULT_META[k]);
		if (anyNotDefault) {
			const serMeta = Object.keys(FilterBase._DEFAULT_META).map(k => UrlUtil.mini.compress(this._meta[k] === undefined ? FilterBase._DEFAULT_META[k] : this._meta[k]));
			return [UrlUtil.packSubHash(this.getSubHashPrefix("meta", this.header), serMeta)]
		} else return null;
	}

	setMetaFromSubHashState (state) {
		const hasMeta = this._doApplyMeta(state, this.getDefaultMeta());
		if (!hasMeta) this.resetBase();
	}

	_doApplyMeta (state, defaultMeta) {
		let hasMeta = false;
		Object.entries(state).forEach(([k, vals]) => {
			const prop = FilterBase.getProp(k);
			if (prop === "meta") {
				hasMeta = true;
				const data = vals.map(v => UrlUtil.mini.decompress(v));
				Object.keys(defaultMeta).forEach((k, i) => {
					if (data[i] !== undefined) this._meta[k] = data[i];
					else this._meta[k] = defaultMeta[k];
				});
			}
		});
		return hasMeta;
	}

	setBaseStateFromLoaded (toLoad) { Object.assign(this._meta, toLoad.meta); }

	getSubHashPrefix (prop, header) {
		if (FilterBase._SUB_HASH_PREFIXES[prop]) {
			const prefix = this._filterBox.getNamespacedHashKey(FilterBase._SUB_HASH_PREFIXES[prop]);
			return `${prefix}${header.toUrlified()}`;
		}
		throw new Error(`Unknown property "${prop}"`);
	}

	static getProp (prefix) {
		return Parser._parse_bToA(FilterBase._SUB_HASH_PREFIXES, prefix);
	}

	_$getBtnMobToggleControls ($wrpControls) {
		const $btnMobToggleControls = $(`<button class="btn btn-xs btn-default mobile__visible ml-2 px-3"><span class="glyphicon glyphicon-option-vertical"/></button>`)
			.click(() => this._meta.isMobileHeaderHidden = !this._meta.isMobileHeaderHidden);
		const hkMobHeaderHidden = () => {
			$btnMobToggleControls.toggleClass("active", !this._meta.isMobileHeaderHidden);
			$wrpControls.toggleClass("mobile__hidden", !!this._meta.isMobileHeaderHidden);
		};
		this._addHook("meta", "isMobileHeaderHidden", hkMobHeaderHidden);
		hkMobHeaderHidden();

		return $btnMobToggleControls;
	}

	getChildFilters () { return []; }
	getDefaultMeta () { return {...FilterBase._DEFAULT_META}; }

	/**
	 * @param vals Previously-read filter value may be passed in for performance.
	 */
	isActive (vals) {
		vals = vals || this.getValues();
		return vals[this.header]._isActive;
	}

	$render () { throw new Error(`Unimplemented!`); }
	getValues () { throw new Error(`Unimplemented!`); }
	reset () { throw new Error(`Unimplemented!`); }
	resetShallow () { throw new Error(`Unimplemented!`); }
	update () { throw new Error(`Unimplemented!`); }
	toDisplay () { throw new Error(`Unimplemented!`); }
	addItem () { throw new Error(`Unimplemented!`); }
	// N.B.: due to a bug in Chrome, these return a copy of the underlying state rather than a copy of the proxied state
	getSaveableState () { throw new Error(`Unimplemented!`); }
	setStateFromLoaded () { throw new Error(`Unimplemented!`); }
	getSubHashes () { throw new Error(`Unimplemented!`); }
	setFromSubHashState () { throw new Error(`Unimplemented!`); }
	setFromValues () { throw new Error(`Unimplemented!`); }
}
FilterBase._DEFAULT_META = {
	isHidden: false,
	isMobileHeaderHidden: true
};
// These are assumed to be the same length (4 characters)
FilterBase._SUB_HASH_STATE_PREFIX = "flst";
FilterBase._SUB_HASH_META_PREFIX = "flmt";
FilterBase._SUB_HASH_NESTS_HIDDEN_PREFIX = "flnh";
FilterBase._SUB_HASH_PREFIXES = {
	state: FilterBase._SUB_HASH_STATE_PREFIX,
	meta: FilterBase._SUB_HASH_META_PREFIX,
	nestsHidden: FilterBase._SUB_HASH_NESTS_HIDDEN_PREFIX
};

class Filter extends FilterBase {
	static _getAsFilterItems (items) {
		return items ? items.map(it => it instanceof FilterItem ? it : new FilterItem({item: it})) : null;
	}

	static _validateItemNests (items, nests) {
		if (!nests) return;
		const noNest = items.find(it => !nests[it.nest]);
		if (noNest) throw new Error(`Did not have a nest: "${noNest.item}"`);
		const invalid = items.find(it => !it.nest || !nests[it.nest]);
		if (invalid) throw new Error(`Invalid nest: "${invalid.item}"`);
	}

	/**
	 * @param opts Options object.
	 * @param opts.items Array of filter items, either `FilterItem` or strings. e.g. `["DMG", "VGM"]`
	 * @param [opts.nests] Key-value object of `"Nest Name": {...nestMeta}`. Nests are used to group/nest filters.
	 * @param [opts.displayFn] Function which translates an item to a displayable form, e.g. `"MM` -> "Monster Manual"`
	 * @param [opts.displayFnMini] Function which translates an item to a shortened displayable form, e.g. `"UABravoCharlie` -> "UABC"`
	 * @param [opts.displayFnTitle] Function which translates an item to a form for displaying in a "title" tooltip
	 * @param [opts.selFn] Function which returns true if an item should be displayed by default; false otherwise.
	 * @param [opts.deselFn] Function which returns true if an item should be hidden by default; false otherwise.
	 * @param [opts.itemSortFn] Function which should be used to sort the `items` array if new entries are added.
	 *        Defaults to ascending alphabetical sort.
	 * @param [opts.itemSortFnMini] Function which should be used to sort the `items` array when rendering mini-pills.
	 * @param [opts.groupFn] Function which takes an item and assigns it to a group.
	 * @param [opts.minimalUi] True if the filter should render with a reduced UI, false otherwise.
	 * @param [opts.umbrellaItems] Items which should, when set active, show everything in the filter. E.g. "All".
	 * @param [opts.umbrellaExcludes] Items which should ignore the state of any `umbrellaItems`
	 */
	constructor (opts) {
		super(opts);
		this._items = Filter._getAsFilterItems(opts.items || []);
		this._nests = opts.nests;
		this._displayFn = opts.displayFn;
		this._displayFnMini = opts.displayFnMini;
		this._displayFnTitle = opts.displayFnTitle;
		this._selFn = opts.selFn;
		this._selFnCache = null;
		this._deselFn = opts.deselFn;
		this._itemSortFn = opts.itemSortFn === undefined ? SortUtil.ascSort : opts.itemSortFn;
		this._itemSortFnMini = opts.itemSortFnMini;
		this._groupFn = opts.groupFn;
		this._minimalUi = opts.minimalUi;
		this._umbrellaItems = Filter._getAsFilterItems(opts.umbrellaItems);
		this._umbrellaExcludes = Filter._getAsFilterItems(opts.umbrellaExcludes);

		Filter._validateItemNests(this._items, this._nests);

		this._filterBox = null;
		this._items.forEach(it => this._defaultItemState(it));
		this.__$wrpFilter = null;
		this.__$wrpPills = null;
		this.__$wrpMini = null;
		this.__$wrpNestHeadInner = null;
		this._updateNestSummary = null;
		this.__nestsHidden = {};
		this._nestsHidden = this._getProxy("nestsHidden", this.__nestsHidden);
		this._isNestsDirty = false;
		this._isItemsDirty = false;
		this._pillGroupsMeta = {};
	}

	getSaveableState () {
		return {
			[this.header]: {
				...this.getBaseSaveableState(),
				state: {...this.__state},
				nestsHidden: {...this.__nestsHidden}
			}
		};
	}

	setStateFromLoaded (filterState) {
		if (filterState && filterState[this.header]) {
			const toLoad = filterState[this.header];
			this.setBaseStateFromLoaded(toLoad);
			Object.assign(this._state, toLoad.state);
			Object.assign(this._nestsHidden, toLoad.nestsHidden);
		}
	}

	getSubHashes () {
		const out = [];

		const baseMeta = this.getMetaSubHashes();
		if (baseMeta) out.push(...baseMeta);

		const areNotDefaultState = Object.entries(this._state).filter(([k, v]) => {
			const defState = this._getDefaultState(k);
			return defState !== v;
		});
		if (areNotDefaultState.length) {
			// serialize state as `key=value` pairs
			const serPillStates = areNotDefaultState.map(([k, v]) => `${k.toUrlified()}=${v}`);
			out.push(UrlUtil.packSubHash(this.getSubHashPrefix("state", this.header), serPillStates));
		}

		const areNotDefaultNestsHidden = Object.entries(this._nestsHidden).filter(([k, v]) => this._nests[k] && !(this._nests[k].isHidden === v));
		if (areNotDefaultNestsHidden.length) {
			// serialize nestsHidden as `key=value` pairs
			const nestsHidden = areNotDefaultNestsHidden.map(([k]) => `${k.toUrlified()}=1`);
			out.push(UrlUtil.packSubHash(this.getSubHashPrefix("nestsHidden", this.header), nestsHidden));
		}

		return out.length ? out : null;
	}

	setFromSubHashState (state) {
		this.setMetaFromSubHashState(state);

		let hasState = false;
		let hasNestsHidden = false;

		Object.entries(state).forEach(([k, vals]) => {
			const prop = FilterBase.getProp(k);
			switch (prop) {
				case "state": {
					hasState = true;
					const nxtState = {};
					Object.keys(this._state).forEach(k => nxtState[k] = this._getDefaultState(k));
					vals.forEach(v => {
						const [statePropLower, state] = v.split("=");
						const stateProp = Object.keys(this._state).find(k => k.toLowerCase() === statePropLower);
						if (stateProp) nxtState[stateProp] = Number(state);
					});
					this._setState(nxtState);
					break;
				}
				case "nestsHidden": {
					hasNestsHidden = true;
					const nxtNestsHidden = {};
					Object.keys(this._nestsHidden).forEach(k => {
						const nestKey = Object.keys(this._nests).find(it => k.toLowerCase() === it.toLowerCase());
						nxtNestsHidden[k] = this._nests[nestKey] && this._nests[nestKey].isHidden;
					});
					vals.forEach(v => {
						const [nestNameLower, state] = v.split("=");
						const nestName = Object.keys(this._nestsHidden).find(k => k.toLowerCase() === nestNameLower);
						if (nestName) nxtNestsHidden[nestName] = !!Number(state);
					});
					this._proxyAssign("nestsHidden", "_nestsHidden", "__nestsHidden", nxtNestsHidden, true);
					break;
				}
			}
		});

		if (!hasState) this.reset();
		if (!hasNestsHidden) this._resetNestsHidden();
	}

	setFromValues (values) {
		if (values[this.header]) {
			Object.keys(this._state).forEach(k => this._state[k] = 0);
			Object.assign(this._state, values[this.header]);
		}
	}

	setValue (k, v) { this._state[k] = v; }

	_resetNestsHidden () {
		if (this._nests) Object.entries(this._nests).forEach(([nestName, nestMeta]) => this._nestsHidden[nestName] = !!nestMeta.isHidden);
	}

	_defaultItemState (item) {
		// if both a selFn and a deselFn are specified, we default to deselecting
		this._state[item.item] = this._getDefaultState(item.item);
	}

	_getDefaultState (k) { return this._deselFn && this._deselFn(k) ? 2 : this._selFn && this._selFn(k) ? 1 : 0; }

	_$getPill (item) {
		const $btnPill = $(`<div class="fltr__pill">${this._displayFn ? this._displayFn(item.item) : item.item}</div>`)
			.click(() => {
				if (++this._state[item.item] > 2) this._state[item.item] = 0;
			})
			.contextmenu((evt) => {
				evt.preventDefault();

				if (--this._state[item.item] < 0) this._state[item.item] = 2;
			});
		const hook = () => {
			const val = FilterBox._PILL_STATES[this._state[item.item]];
			$btnPill.attr("state", val);
			if (item.pFnChange) item.pFnChange(item.item, val);
		};
		this._addHook("state", item.item, hook);
		hook();

		return $btnPill;
	}

	setTempFnSel (tempFnSel) {
		this._selFnCache = this._selFnCache || this._selFn;
		if (tempFnSel) this._selFn = tempFnSel;
		else this._selFn = this._selFnCache;
	}

	updateMiniPillClasses () {
		this._items.filter(it => it.$mini).forEach(it => {
			const isDefaultDesel = this._deselFn && this._deselFn(it.item);
			const isDefaultSel = this._selFn && this._selFn(it.item);
			it.$mini
				.toggleClass("fltr__mini-pill--default-desel", isDefaultDesel)
				.toggleClass("fltr__mini-pill--default-sel", isDefaultSel)
		});
	}

	_$getMini (item) {
		const toDisplay = this._displayFnMini ? this._displayFnMini(item.item) : this._displayFn ? this._displayFn(item.item) : item.item;

		// This one-liner is slightly more performant than doing it nicely
		const $btnMini = $(
			`<div class="fltr__mini-pill ${this._filterBox.isMinisHidden(this.header) ? "ve-hidden" : ""} ${this._deselFn && this._deselFn(item.item) ? "fltr__mini-pill--default-desel" : ""} ${this._selFn && this._selFn(item.item) ? "fltr__mini-pill--default-sel" : ""}" state="${FilterBox._PILL_STATES[this._state[item.item]]}">${toDisplay}</div>`
		).title(`${this._displayFnTitle ? `${this._displayFnTitle(item.item)} (` : ""}Filter: ${this.header}${this._displayFnTitle ? ")" : ""}`).click(() => {
			this._state[item.item] = 0;
			this._filterBox.fireChangeEvent();
		});

		const hook = () => $btnMini.attr("state", FilterBox._PILL_STATES[this._state[item.item]]);
		this._addHook("state", item.item, hook);

		const hideHook = () => $btnMini.toggleClass("ve-hidden", this._filterBox.isMinisHidden(this.header));
		this._filterBox.registerMinisHiddenHook(this.header, hideHook);

		return $btnMini;
	}

	_doSetPillsAll () {
		Object.keys(this._state).forEach(k => this._state[k] = 1);
	}

	_doSetPillsClear () {
		Object.keys(this._state).forEach(k => this._state[k] = 0);
	}

	_doSetPillsNone () {
		Object.keys(this._state).forEach(k => this._state[k] = 2);
	}

	_doSetPinsDefault () {
		this.reset();
	}

	_$getHeaderControls (opts) {
		const $btnAll = $(`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} fltr__h-btn--all w-100">All</button>`).click(() => this._doSetPillsAll());
		const $btnClear = $(`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} fltr__h-btn--clear w-100">Clear</button>`).click(() => this._doSetPillsClear());
		const $btnNone = $(`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} fltr__h-btn--none w-100">None</button>`).click(() => this._doSetPillsNone());
		const $btnDefault = $(`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} w-100">Default</button>`).click(() => this._doSetPinsDefault());

		const $wrpStateBtns = $$`<div class="btn-group flex-v-center w-100">${$btnAll}${$btnClear}${$btnNone}${$btnDefault}</div>`;
		const $wrpStateBtnsOuter = $$`<div class="flex-v-center fltr__h-wrp-state-btns-outer">${$wrpStateBtns}</div>`;
		this._$getHeaderControls_addExtraStateBtns(opts, $wrpStateBtnsOuter);

		const $wrpSummary = $(`<div class="flex-vh-center"/>`).hide();

		const $btnCombineBlue = $$`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} fltr__h-btn-logic--blue fltr__h-btn-logic w-100" title="Positive matches mode for this filter. AND requires all blues to match, OR requires at least one blue to match."/>`
			.click(() => this._meta.combineBlue = this._meta.combineBlue === "or" ? "and" : "or");
		const hookCombineBlue = () => $btnCombineBlue.text(this._meta.combineBlue.toUpperCase());
		this._addHook("meta", "combineBlue", hookCombineBlue);
		hookCombineBlue();

		const $btnCombineRed = $$`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} fltr__h-btn-logic--red fltr__h-btn-logic w-100" title="Negative match mode for this filter. AND requires all reds to match, OR requires at least one red to match."/>`
			.click(() => this._meta.combineRed = this._meta.combineRed === "or" ? "and" : "or");
		const hookCombineRed = () => $btnCombineRed.text(this._meta.combineRed.toUpperCase());
		this._addHook("meta", "combineRed", hookCombineRed);
		hookCombineRed();

		const $btnShowHide = $(`<button class="btn btn-default ${opts.isMulti ? "btn-xxs" : "btn-xs"} ml-2">Hide</button>`)
			.click(() => this._meta.isHidden = !this._meta.isHidden);
		const hookShowHide = () => {
			$btnShowHide.toggleClass("active", this._meta.isHidden);
			$wrpStateBtnsOuter.toggle(!this._meta.isHidden);
			$wrpSummary.toggleClass("ve-hidden", !this._meta.isHidden).empty();

			// render summary
			const cur = this.getValues()[this.header];

			$(`<span class="fltr__summary_item fltr__summary_item--include"/>`)
				.title(`${cur._totals.yes} hidden "required" tags`)
				.text(cur._totals.yes)
				.toggle(!!cur._totals.yes)
				.appendTo($wrpSummary);

			$(`<span class="fltr__summary_item_spacer"/>`)
				.toggle(!!(cur._totals.yes && cur._totals.no))
				.appendTo($wrpSummary);

			$(`<span class="fltr__summary_item fltr__summary_item--exclude"/>`)
				.title(`${cur._totals.no} hidden "excluded" tags`)
				.text(cur._totals.no)
				.toggle(!!cur._totals.no)
				.appendTo($wrpSummary);
		};
		this._addHook("meta", "isHidden", hookShowHide);
		hookShowHide();

		return $$`
		<div class="flex-v-center fltr__h-wrp-btns-outer">
			${$wrpSummary}
			${$wrpStateBtnsOuter}
			<span class="btn-group ml-2 flex-v-center">
				${$btnCombineBlue}
				${$btnCombineRed}
			</span>
			${$btnShowHide}
		</div>`;
	}

	_$getHeaderControls_addExtraStateBtns () {
		// To be optionally implemented by child classes
	}

	/**
	 * @param opts Options.
	 * @param opts.filterBox The FilterBox to which this filter is attached.
	 * @param opts.isFirst True if this is visually the first filter in the box.
	 * @param opts.$wrpMini The form mini-view element.
	 * @param opts.isMulti The name of the MultiFilter this filter belongs to, if any.
	 */
	$render (opts) {
		this._filterBox = opts.filterBox;
		this.__$wrpMini = opts.$wrpMini;

		const $wrpControls = this._$getHeaderControls(opts);

		this.__$wrpPills = $$`<div class="fltr__wrp-pills ${this._groupFn ? "fltr__wrp-subs" : ""}"/>`;
		const hook = () => this.__$wrpPills.toggle(!this._meta.isHidden);
		this._addHook("meta", "isHidden", hook);
		hook();

		if (this._nests) {
			const $wrpNestHead = $(`<div class="fltr__wrp-pills--sub"/>`).appendTo(this.__$wrpPills);
			this.__$wrpNestHeadInner = $(`<div class="flex flex-wrap"/>`).appendTo($wrpNestHead);

			const $wrpNestHeadSummary = $(`<div class="fltr__summary_nest"/>`).appendTo($wrpNestHead);

			this._updateNestSummary = () => {
				const stats = {high: 0, low: 0};
				this._items.filter(it => this._state[it.item] && this._nestsHidden[it.nest]).forEach(it => {
					const key = this._state[it.item] === 1 ? "high" : "low";
					stats[key]++;
				});
				$wrpNestHeadSummary.empty();
				if (stats.high) {
					$(`<span class="fltr__summary_item fltr__summary_item--include">${stats.high}</span>`)
						.title(`${stats.high} hidden "required" tag${stats.high === 1 ? "" : "s"}`)
						.appendTo($wrpNestHeadSummary);
				}
				if (stats.high && stats.low) $(`<span class="fltr__summary_item_spacer"/>`).appendTo($wrpNestHeadSummary);
				if (stats.low) {
					$(`<span class="fltr__summary_item fltr__summary_item--exclude">${stats.low}</span>`)
						.title(`${stats.low} hidden "excluded" tag${stats.low === 1 ? "" : "s"}`)
						.appendTo($wrpNestHeadSummary);
				}
			};

			this._doRenderNests();
		}

		this._doRenderPills();
		this._doRenderMiniPills();

		const $btnMobToggleControls = this._$getBtnMobToggleControls($wrpControls);

		this.__$wrpFilter = $$`<div>
			${opts.isFirst ? "" : `<div class="fltr__dropdown-divider ${opts.isMulti ? "fltr__dropdown-divider--indented" : ""} mb-1"/>`}
			<div class="split fltr__h ${this._minimalUi ? "fltr__minimal-hide" : ""} mb-1">
				<div class="ml-2 fltr__h-text flex-h-center">${opts.isMulti ? `<span class="mr-2">\u2012</span>` : ""}${this.header}${$btnMobToggleControls}</div>
				${$wrpControls}
			</div>
			${this.__$wrpPills}
		</div>`;

		this._doToggleDisplay();

		return this.__$wrpFilter;
	}

	getValues () {
		const state = MiscUtil.copy(this._state);
		// remove state for any currently-absent filters
		Object.keys(state).filter(k => !this._items.some(it => `${it.item}` === k)).forEach(k => delete state[k]);
		const out = {...state};

		// add helper data
		out._isActive = Object.values(state).some(Boolean);
		out._totals = {yes: 0, no: 0, ignored: 0};
		Object.values(state).forEach(v => {
			const totalKey = v === 0 ? "ignored" : v === 1 ? "yes" : "no";
			out._totals[totalKey]++;
		});
		out._andOr = {blue: this._meta.combineBlue, red: this._meta.combineRed};
		return {[this.header]: out};
	}

	reset (isResetAll) {
		if (isResetAll) {
			this.resetBase();
			this._resetNestsHidden();
		}
		Object.keys(this._state).forEach(k => delete this._state[k]);
		this._items.forEach(it => this._defaultItemState(it));
	}

	resetShallow () { return this.reset(); }

	_doRenderPills () {
		if (this._itemSortFn) this._items.sort(this._itemSortFn);
		this._items.forEach(it => {
			if (!it.$rendered) {
				it.$rendered = this._$getPill(it);
				if (it.nest) {
					const hook = () => it.$rendered.toggle(!this._nestsHidden[it.nest]);
					this._addHook("nestsHidden", it.nest, hook);
					hook();
				}
			}

			if (this._groupFn) {
				const group = this._groupFn(it);
				if (!this._pillGroupsMeta[group]) {
					this._pillGroupsMeta[group] = {
						$hrDivider: $(`<hr class="fltr__dropdown-divider--sub">`).appendTo(this.__$wrpPills),
						$wrpPills: $(`<div class="fltr__wrp-pills--sub"/>`).appendTo(this.__$wrpPills)
					};

					Object.entries(this._pillGroupsMeta)
						.sort((a, b) => SortUtil.ascSortLower(a[0], b[0]))
						.forEach(([groupKey, groupMeta], i) => {
							groupMeta.$hrDivider.appendTo(this.__$wrpPills);
							groupMeta.$hrDivider.toggle(!(i === 0 && this._nests == null));
							groupMeta.$wrpPills.appendTo(this.__$wrpPills);
						});

					if (this._nests) {
						this._pillGroupsMeta[group].toggleDividerFromNestVisibility = () => {
							const groupItems = this._items.filter(it => this._groupFn(it) === group);
							const hiddenGroupItems = groupItems.filter(it => this._nestsHidden[it.nest]);
							this._pillGroupsMeta[group].$hrDivider.toggle(groupItems.length !== hiddenGroupItems.length);
						};

						// bind group dividers to show/hide depending on nest visibility state
						Object.keys(this._nests).forEach(nestName => {
							const hook = () => this._pillGroupsMeta[group].toggleDividerFromNestVisibility();
							this._addHook("nestsHidden", nestName, hook);
							hook();
							this._pillGroupsMeta[group].toggleDividerFromNestVisibility();
						});
					}
				}

				this._pillGroupsMeta[group].$wrpPills.append(it.$rendered);
			} else this.__$wrpPills.append(it.$rendered);
		});
	}

	_doRenderMiniPills () {
		// create a list view so we can freely sort
		const view = this._items.slice(0);
		if (this._itemSortFnMini || this._itemSortFn) view.sort(this._itemSortFnMini || this._itemSortFn);
		view.forEach(it => {
			// re-append existing elements to sort them
			(it.$mini = it.$mini || this._$getMini(it)).appendTo(this.__$wrpMini);
		});
	}

	_doToggleDisplay () {
		// if there are no items, hide everything
		this.__$wrpFilter.toggleClass("fltr__no-items", !this._items.length);
	}

	_doRenderNests () {
		Object.entries(this._nests)
			.sort((a, b) => SortUtil.ascSort(a[0], b[0])) // array 0 (key) is the nest name
			.forEach(([nestName, nestMeta]) => {
				if (nestMeta._$btnNest == null) {
					// this can be restored from a saved state, otherwise, initialise it
					if (this._nestsHidden[nestName] == null) this._nestsHidden[nestName] = !!nestMeta.isHidden;

					const $btnText = $(`<span>${nestName} [${this._nestsHidden[nestName] ? "+" : "\u2212"}]</span>`);
					nestMeta._$btnNest = $$`<div class="fltr__btn_nest">${$btnText}</div>`
						.click(() => this._nestsHidden[nestName] = !this._nestsHidden[nestName]);

					const hook = () => {
						$btnText.text(`${nestName} [${this._nestsHidden[nestName] ? "+" : "\u2212"}]`);

						const stats = {high: 0, low: 0, total: 0};
						this._items
							.filter(it => it.nest === nestName)
							.find(it => {
								const key = this._state[it.item] === 1 ? "high" : this._state[it.item] ? "low" : "ignored";
								stats[key]++;
								stats.total++;
							});
						const allHigh = stats.total === stats.high;
						const allLow = stats.total === stats.low;
						nestMeta._$btnNest.toggleClass("fltr__btn_nest--include-all", this._nestsHidden[nestName] && allHigh)
							.toggleClass("fltr__btn_nest--exclude-all", this._nestsHidden[nestName] && allLow)
							.toggleClass("fltr__btn_nest--include", this._nestsHidden[nestName] && !!(!allHigh && !allLow && stats.high && !stats.low))
							.toggleClass("fltr__btn_nest--exclude", this._nestsHidden[nestName] && !!(!allHigh && !allLow && !stats.high && stats.low))
							.toggleClass("fltr__btn_nest--both", this._nestsHidden[nestName] && !!(!allHigh && !allLow && stats.high && stats.low));

						this._updateNestSummary();
					};

					this._items
						.filter(it => it.nest === nestName)
						.find(it => {
							this._addHook("state", it.item, hook);
						});

					this._addHook("nestsHidden", nestName, hook);
					hook();
				}
				nestMeta._$btnNest.appendTo(this.__$wrpNestHeadInner);
			});

		this._updateNestSummary();
	}

	update () {
		if (this._isNestsDirty) {
			this._isNestsDirty = false;

			this._doRenderNests();
		}

		if (this._isItemsDirty) {
			this._isItemsDirty = false;

			this._doRenderPills();
		}

		// always render the mini-pills, to ensure the overall order in the grid stays correct (shared between multiple filters)
		this._doRenderMiniPills();
		this._doToggleDisplay();
	}

	addItem (item) {
		if (item == null) return;
		if (item instanceof Array) item.forEach(it => this.addItem(it));
		else if (!this._items.find(it => Filter._isItemsEqual(it, item))) {
			item = item instanceof FilterItem ? item : new FilterItem({item});
			Filter._validateItemNests([item], this._nests);

			this._isItemsDirty = true;
			this._items.push(item);
			if (this._state[item.item] == null) this._defaultItemState(item);
		}
	}

	static _isItemsEqual (item1, item2) {
		return (item1 instanceof FilterItem ? item1.item : item1) === (item2 instanceof FilterItem ? item2.item : item2);
	}

	removeItem (item) {
		const ixItem = this._items.findIndex(it => Filter._isItemsEqual(it, item));
		if (~ixItem) {
			const item = this._items[ixItem];

			// FIXME this doesn't remove any associated hooks, and is therefore a minor memory leak
			this._isItemsDirty = true;
			item.$rendered.detach();
			item.$mini.detach();
			this._items.splice(ixItem, 1);
		}
	}

	addNest (nestName, nestMeta) {
		// may need to allow this in future
		// can easily be circumvented by initialising with empty nests in filter construction
		if (!this._nests) throw new Error(`Filter was not nested!`);
		if (!this._nests[nestName]) {
			this._isNestsDirty = true;
			this._nests[nestName] = nestMeta;

			// bind group dividers to show/hide based on the new nest
			if (this._groupFn) {
				Object.keys(this._pillGroupsMeta).forEach(group => {
					const hook = () => this._pillGroupsMeta[group].toggleDividerFromNestVisibility();
					this._addHook("nestsHidden", nestName, hook);
					hook();
					this._pillGroupsMeta[group].toggleDividerFromNestVisibility();
				});
			}
		}
	}

	toDisplay (boxState, entryVal) {
		const filterState = boxState[this.header];
		if (!filterState) return true;

		const totals = filterState._totals;

		if (!(entryVal instanceof Array)) entryVal = [entryVal];
		entryVal = entryVal.map(it => it instanceof FilterItem ? it : new FilterItem({item: it}));

		const isUmbrella = () => {
			if (this._umbrellaItems) {
				if (!entryVal) return false;

				if (this._umbrellaExcludes && this._umbrellaExcludes.some(it => filterState[it.item])) return false;

				return this._umbrellaItems.some(u => entryVal.includes(u.item))
					&& (this._umbrellaItems.some(u => filterState[u.item] === 0) || this._umbrellaItems.some(u => filterState[u.item] === 1));
			}
		};

		let hide = false;
		let display = false;

		if (filterState._andOr.blue === "or") {
			// default to displaying
			if (totals.yes === 0) display = true;

			// if any are 1 (blue) include if they match
			display = display || entryVal.some(fi => filterState[fi.item] === 1 || isUmbrella());
		} else {
			const totalYes = entryVal.filter(fi => filterState[fi.item] === 1).length;
			display = !totals.yes || totals.yes === totalYes;
		}

		if (filterState._andOr.red === "or") {
			// if any are 2 (red) exclude if they match
			hide = hide || entryVal.filter(fi => !fi.isIgnoreRed).some(fi => filterState[fi.item] === 2);
		} else {
			const totalNo = entryVal.filter(fi => !fi.isIgnoreRed).filter(fi => filterState[fi.item] === 2).length;
			hide = totals.no && totals.no === totalNo;
		}

		return display && !hide;
	}

	getDefaultMeta () {
		// Key order is important, as @filter tags depend on it
		return {
			...Filter._DEFAULT_META,
			...super.getDefaultMeta()
		};
	}
}
Filter._DEFAULT_META = {
	combineBlue: "or",
	combineRed: "or"
};

class SourceFilter extends Filter {
	constructor (opts) {
		super(opts);
		this.__tmpState = {ixAdded: 0};
		this._tmpState = this._getProxy("tmpState", this.__tmpState);
	}

	doSetPillsClear () { return this._doSetPillsClear(); }

	addItem (item) {
		const out = super.addItem(item);
		this._tmpState.ixAdded++;
		return out;
	}

	removeItem (item) {
		const out = super.removeItem(item);
		this._tmpState.ixAdded--;
		return out;
	}

	_$getHeaderControls_addExtraStateBtns (opts, $wrpStateBtnsOuter) {
		const $btnSupplements = $(`<button class="btn btn-default w-100 ${opts.isMulti ? "btn-xxs" : "btn-xs"}" title="SHIFT to include UA/etc.">Core/Supplements</button>`)
			.click(evt => this._doSetPinsSupplements(evt.shiftKey));

		const $btnAdventures = $(`<button class="btn btn-default w-100 ${opts.isMulti ? "btn-xxs" : "btn-xs"}" title="SHIFT to include UA/etc.">Adventures</button>`)
			.click(evt => this._doSetPinsAdventures(evt.shiftKey));

		const $btnHomebrew = $(`<button class="btn btn-default w-100 ${opts.isMulti ? "btn-xxs" : "btn-xs"}">Homebrew</button>`)
			.click(() => this._doSetPinsHomebrew());
		const hkIsBrewActive = () => {
			const hasBrew = Object.keys(this.__state).some(src => SourceUtil.getFilterGroup(src) === 2);
			$btnHomebrew.toggleClass("ve-hidden", !hasBrew);
		};
		this._addHook("tmpState", "ixAdded", hkIsBrewActive);
		hkIsBrewActive();

		$$`<div class="btn-group mr-2 w-100 flex-v-center mobile__m-1 mobile__mb-2">${$btnSupplements}${$btnAdventures}${$btnHomebrew}</div>`.prependTo($wrpStateBtnsOuter);
	}

	_doSetPinsSupplements (isIncludeUnofficial) {
		Object.keys(this._state)
			.forEach(k => this._state[k] = SourceUtil.isCoreOrSupplement(k) && (isIncludeUnofficial || !SourceUtil.isNonstandardSource(k)) ? 1 : 0);
	}

	_doSetPinsAdventures (isIncludeUnofficial) {
		Object.keys(this._state).forEach(k => this._state[k] = SourceUtil.isAdventure(k) && (isIncludeUnofficial || !SourceUtil.isNonstandardSource(k)) ? 1 : 0);
	}

	_doSetPinsHomebrew () {
		Object.keys(this._state)
			.forEach(k => this._state[k] = SourceUtil.getFilterGroup(k) === 2 ? 1 : 0);
	}

	static getInstance (options) {
		if (!options) options = {};

		const baseOptions = {
			header: FilterBox.SOURCE_HEADER,
			displayFn: (item) => Parser.sourceJsonToFullCompactPrefix(item.item || item),
			selFn: PageFilter.defaultSourceSelFn,
			groupFn: SourceUtil.getFilterGroup
		};
		Object.assign(baseOptions, options);
		return new SourceFilter(baseOptions);
	}
}

class RangeFilter extends FilterBase {
	/**
	 * @param opts Options object.
	 * @param [opts.header] Filter header.
	 * @param [opts.min] Minimum slider value.
	 * @param [opts.max] Maximum slider value.
	 * @param [opts.isLabelled] If this slider has labels.
	 * @param [opts.labels] Initial labels to populate this filter with.
	 * @param [opts.isAllowGreater] If this slider should allow all items greater than its max.
	 * @param [opts.suffix] Suffix to add to numbers displayed above slider.
	 * @param [opts.labelSortFn] Function used to sort labels if new labels are added. Defaults to ascending alphabetical.
	 */
	constructor (opts) {
		super(opts);

		if (opts.labels && opts.min == null) opts.min = 0;
		if (opts.labels && opts.max == null) opts.max = opts.labels.length - 1;

		this._min = Number(opts.min || 0);
		this._max = Number(opts.max || 0);
		this._labels = opts.isLabelled ? opts.labels : null;
		this._isAllowGreater = !!opts.isAllowGreater;
		this._suffix = opts.suffix;
		this._labelSortFn = opts.labelSortFn === undefined ? SortUtil.ascSort : opts.labelSortFn;

		this._filterBox = null;
		Object.assign(
			this.__state,
			{
				min: this._min,
				max: this._max,
				curMin: this._min,
				curMax: this._max
			}
		);
		this.__$wrpMini = null;
		this._$btnsMini = [];
		this._$slider = null;
	}

	set isUseDropdowns (val) { this._meta.isUseDropdowns = !!val; }

	getSaveableState () {
		return {
			[this.header]: {
				...this.getBaseSaveableState(),
				state: {...this.__state}
			}
		};
	}

	setStateFromLoaded (filterState) {
		if (filterState && filterState[this.header]) {
			const toLoad = filterState[this.header];
			this.setBaseStateFromLoaded(toLoad);

			// Reduce the maximum/minimum ranges to their current values +/-1
			//   This allows the range filter to recover from being stretched out by homebrew
			//   The off-by-one trick is to prevent later filter expansion from assuming the filters are set to their min/max
			if (toLoad.state && !this._labels) {
				if (toLoad.state.curMax != null && toLoad.state.max != null) {
					if (toLoad.state.curMax + 1 < toLoad.state.max) toLoad.state.max = toLoad.state.curMax + 1;
				}

				if (toLoad.state.curMin != null && toLoad.state.min != null) {
					if (toLoad.state.curMin - 1 > toLoad.state.min) toLoad.state.min = toLoad.state.curMin - 1;
				}
			}

			Object.assign(this._state, toLoad.state);
		}
	}

	getSubHashes () {
		const out = [];

		const baseMeta = this.getMetaSubHashes();
		if (baseMeta) out.push(...baseMeta);

		const serSliderState = [
			this._state.min !== this._state.curMin ? `min=${this._state.curMin}` : null,
			this._state.max !== this._state.curMax ? `max=${this._state.curMax}` : null
		].filter(Boolean);
		if (serSliderState.length) {
			out.push(UrlUtil.packSubHash(this.getSubHashPrefix("state", this.header), serSliderState));
		}

		return out.length ? out : null;
	}

	setFromSubHashState (state) {
		this.setMetaFromSubHashState(state);

		let hasState = false;

		Object.entries(state).forEach(([k, vals]) => {
			const prop = FilterBase.getProp(k);
			if (prop === "state") {
				hasState = true;
				vals.forEach(v => {
					const [prop, val] = v.split("=");
					if (val.startsWith("&") && !this._labels) throw new Error(`Could not dereference label: "${val}"`);

					let num;
					if (val.startsWith("&")) { // prefixed with "&" for "address (index) of..."
						const clean = val.replace("&", "").toLowerCase();
						num = this._labels.findIndex(it => String(it).toLowerCase() === clean);
						if (!~num) throw new Error(`Could not find index for label "${clean}"`);
					} else num = Number(val);

					switch (prop) {
						case "min":
							if (num < this._state.min) this._state.min = num;
							this._state.curMin = Math.max(this._state.min, num);
							break;
						case "max":
							if (num > this._state.max) this._state.max = num;
							this._state.curMax = Math.min(this._state.max, num);
							break;
						default: throw new Error(`Unknown prop "${prop}"`);
					}
				});
			}
		});

		if (!hasState) this.reset();
	}

	setFromValues (values) {
		if (values[this.header]) {
			const vals = values[this.header];

			if (vals.min != null) this._state.curMin = Math.max(this._state.min, vals.min);
			else this._state.curMin = this._state.min;

			if (vals.max != null) this._state.curMax = Math.max(this._state.max, vals.max);
			else this._state.curMax = this._state.max;
		}
	}

	_$getHeaderControls () {
		const $btnForceMobile = ComponentUiUtil.$getBtnBool(
			this,
			"isUseDropdowns",
			{
				$ele: $(`<button class="btn btn-default btn-xs mr-2">Show as Dropdowns</button>`),
				stateName: "meta",
				stateProp: "_meta"
			}
		);
		const $btnReset = $(`<button class="btn btn-default btn-xs">Reset</button>`).click(() => this.reset());
		const $wrpBtns = $$`<div>${$btnForceMobile}${$btnReset}</div>`;

		const $wrpSummary = $(`<div class="flex-v-center fltr__summary_item fltr__summary_item--include"/>`).hide();

		const $btnShowHide = $(`<button class="btn btn-default btn-xs ml-2 ${this._meta.isHidden ? "active" : ""}">Hide</button>`)
			.click(() => this._meta.isHidden = !this._meta.isHidden);
		const hook = () => {
			$btnShowHide.toggleClass("active", this._meta.isHidden);
			$wrpBtns.toggle(!this._meta.isHidden);
			$wrpSummary.toggle(this._meta.isHidden);

			// render summary
			const cur = this.getValues()[this.header];

			const isRange = !cur.isMinVal && !cur.isMaxVal;
			const isCapped = !cur.isMinVal || !cur.isMaxVal;
			$wrpSummary
				.title(isRange ? `Hidden range` : isCapped ? `Hidden limit` : "")
				.text(isRange ? `${cur.min}-${cur.max}` : !cur.isMinVal ? `≥ ${cur.min}` : !cur.isMaxVal ? `≤ ${cur.max}` : "")
		};
		this._addHook("meta", "isHidden", hook);
		hook();

		return $$`
		<div class="flex-v-center">
			${$wrpBtns}
			${$wrpSummary}
			${$btnShowHide}
		</div>`;
	}

	/**
	 * @param opts Options.
	 * @param opts.filterBox The FilterBox to which this filter is attached.
	 * @param opts.isFirst True if this is visually the first filter in the box.
	 * @param opts.$wrpMini The form mini-view element.
	 * @param opts.isMulti The name of the MultiFilter this filter belongs to, if any.
	 */
	$render (opts) {
		this._filterBox = opts.filterBox;
		this.__$wrpMini = opts.$wrpMini;

		const $wrpControls = opts.isMulti ? null : this._$getHeaderControls();

		const $wrpSlider = $$`<div class="fltr__wrp-pills fltr__wrp-pills--flex"/>`;
		const $wrpDropdowns = $$`<div class="fltr__wrp-pills fltr__wrp-pills--flex"/>`;
		const hookHidden = () => {
			$wrpSlider.toggle(!this._meta.isHidden && !this._meta.isUseDropdowns);
			$wrpDropdowns.toggle(!this._meta.isHidden && !!this._meta.isUseDropdowns);
		};
		this._addHook("meta", "isHidden", hookHidden);
		this._addHook("meta", "isUseDropdowns", hookHidden);
		hookHidden();

		// region Slider
		// prepare slider options
		const getSliderOpts = () => {
			const sliderOpts = {};
			if (this._labels) {
				if (this._labelSortFn) sliderOpts.labels = this._labels.sort(this._labelSortFn);
				else sliderOpts.labels = this._labels;
			} else if (this._isAllowGreater) {
				sliderOpts.labels = {last: `${this._state.max}+`};
			}
			if (this._suffix) sliderOpts.suffix = this._suffix;
			return sliderOpts;
		};
		const sliderOpts = getSliderOpts();

		this._$slider = $(`<div class="fltr__slider"/>`).appendTo($wrpSlider);
		this._$slider
			.slider({
				min: this._min,
				max: this._max,
				range: true,
				values: [this._min, this._max]
			})
			.slider("pips", sliderOpts)
			.slider("float", sliderOpts)
			.slider().on("slidestop", () => { // triggered when the user stops sliding
				const [min, max] = this._$slider.slider("values");
				this._state.curMin = min;
				this._state.curMax = max;
			});
		// endregion

		// region Dropdowns
		const $selMin = $(`<select class="form-control mr-2"/>`)
			.change(() => {
				const nxtMin = Number($selMin.val());
				const [min, max] = [nxtMin, this._state.curMax].sort(SortUtil.ascSort);
				this._state.curMin = min;
				this._state.curMax = max;
			});
		const $selMax = $(`<select class="form-control"/>`)
			.change(() => {
				const nxMax = Number($selMax.val());
				const [min, max] = [this._state.curMin, nxMax].sort(SortUtil.ascSort);
				this._state.curMin = min;
				this._state.curMax = max;
			});
		$$`<div class="flex-v-center w-100 px-3 py-1">${$selMin}${$selMax}</div>`.appendTo($wrpDropdowns);
		// endregion

		// region Mini pills
		const $btnMiniGt = $(`<div class="fltr__mini-pill" state="ignore"/>`)
			.click(() => {
				this._state.curMin = this._state.min;
				this._filterBox.fireChangeEvent();
			})
			.appendTo(this.__$wrpMini);
		const $btnMiniLt = $(`<div class="fltr__mini-pill" state="ignore"/>`)
			.click(() => {
				this._state.curMax = this._state.max;
				this._filterBox.fireChangeEvent();
			})
			.appendTo(this.__$wrpMini);
		const $btnMiniEq = $(`<div class="fltr__mini-pill" state="ignore"/>`)
			.click(() => {
				this._state.curMin = this._state.min;
				this._state.curMax = this._state.max;
				this._filterBox.fireChangeEvent();
			})
			.appendTo(this.__$wrpMini);
		this._$btnsMini.push($btnMiniGt, $btnMiniLt, $btnMiniEq);

		const hideHook = () => {
			const isHidden = this._filterBox.isMinisHidden(this.header);
			$btnMiniGt.toggleClass("ve-hidden", isHidden);
			$btnMiniLt.toggleClass("ve-hidden", isHidden);
			$btnMiniEq.toggleClass("ve-hidden", isHidden);
		};
		this._filterBox.registerMinisHiddenHook(this.header, hideHook);
		hideHook();

		const handleMiniUpdate = () => {
			if (this._state.curMin === this._state.curMax) {
				$btnMiniGt.attr("state", FilterBox._PILL_STATES[0]);
				$btnMiniLt.attr("state", FilterBox._PILL_STATES[0]);
				$btnMiniEq.attr("state", FilterBox._PILL_STATES[1])
					.text(`${this.header} = ${this._labels ? this._labels[this._state.curMin] : this._state.curMin}`);
			} else {
				if (this._state.min !== this._state.curMin) {
					$btnMiniGt.attr("state", FilterBox._PILL_STATES[1])
						.text(`${this.header} ≥ ${this._labels ? this._labels[this._state.curMin] : this._state.curMin}`);
				} else $btnMiniGt.attr("state", FilterBox._PILL_STATES[0]);

				if (this._state.max !== this._state.curMax) {
					$btnMiniLt.attr("state", FilterBox._PILL_STATES[1])
						.text(`${this.header} ≤ ${this._labels ? this._labels[this._state.curMax] : this._state.curMax}`);
				} else $btnMiniLt.attr("state", FilterBox._PILL_STATES[0]);

				$btnMiniEq.attr("state", FilterBox._PILL_STATES[0]);
			}
		};
		// endregion

		const _populateDropdown = ($sel) => {
			$sel.empty();

			[...new Array(this._state.max - this._state.min + 1)].forEach((_, i) => {
				const val = i + this._state.min;
				const label = this._labels ? this._labels[i] : null;
				$(`<option/>`, {value: val, text: label || val}).appendTo($sel);
			});

			return $sel;
		};

		const handleCurUpdate = () => {
			// Slider
			// defer this otherwise slider fails to update with correct values
			setTimeout(() => this._$slider.slider("values", [this._state.curMin, this._state.curMax]), 5);

			// Dropdowns
			$selMin.val(`${this._state.curMin}`);
			$selMax.val(`${this._state.curMax}`);

			handleMiniUpdate();
		};

		const handleLimitUpdate = () => {
			// Slider
			const sliderOpts = getSliderOpts();
			this._$slider.slider("option", {min: this._state.min, max: this._state.max})
				.slider("pips", sliderOpts)
				.slider("float", sliderOpts);

			// Dropdowns
			_populateDropdown($selMin).val(`${this._state.curMin}`);
			_populateDropdown($selMax).val(`${this._state.curMax}`);

			handleMiniUpdate();
		};

		this._addHook("state", "min", handleLimitUpdate);
		this._addHook("state", "max", handleLimitUpdate);
		this._addHook("state", "curMin", handleCurUpdate);
		this._addHook("state", "curMax", handleCurUpdate);
		handleCurUpdate();
		handleLimitUpdate();

		if (opts.isMulti) {
			this._$slider.addClass("ve-grow");
			$wrpSlider.addClass("ve-grow");
			$wrpDropdowns.addClass("ve-grow");
			return $$`<div class="flex">
				<div class="fltr__range-inline-label">${this.header}</div>
				${$wrpSlider}
				${$wrpDropdowns}
			</div>`;
		} else {
			const $btnMobToggleControls = this._$getBtnMobToggleControls($wrpControls);

			return $$`<div class="flex-col">
				${opts.isFirst ? "" : `<div class="fltr__dropdown-divider mb-1"/>`}
				<div class="split fltr__h ${this._minimalUi ? "fltr__minimal-hide" : ""} mb-1">
					<div class="fltr__h-text flex-h-center">${this.header}${$btnMobToggleControls}</div>
					${$wrpControls}
				</div>
				${$wrpSlider}
				${$wrpDropdowns}
			</div>`;
		}
	}

	getValues () {
		const out = {
			isMaxVal: this._state.max === this._state.curMax,
			isMinVal: this._state.min === this._state.curMin,
			max: this._state.curMax,
			min: this._state.curMin
		};
		out._isActive = !(out.isMinVal && out.isMaxVal);
		return {[this.header]: out};
	}

	reset (isResetAll) {
		if (isResetAll) this.resetBase();
		this._state.curMin = this._state.min;
		this._state.curMax = this._state.max;
	}

	resetShallow (isResetAll) { return this.reset(); }

	update () {
		// (labels will be automatically updated by the slider handlers)
		// always render the mini-pills, to ensure the overall order in the grid stays correct (shared between multiple filters)
		this._$btnsMini.forEach($it => this.__$wrpMini.append($it));
	}

	toDisplay (boxState, entryVal) {
		const filterState = boxState[this.header];
		if (!filterState) return true; // discount any filters which were not rendered

		// match everything if filter is set to complete range
		if (entryVal == null) return filterState.min === this._state.min && filterState.max === this._state.max;

		if (this._labels) {
			const slice = this._labels.slice(filterState.min, filterState.max + 1);
			if (entryVal instanceof Array) {
				return !!entryVal.find(it => slice.includes(it));
			} else {
				return slice.includes(entryVal);
			}
		} else {
			const isGtMin = entryVal instanceof Array ? filterState.min <= Math.min(...entryVal) : filterState.min <= entryVal;
			const isLtMax = entryVal instanceof Array ? filterState.max >= Math.max(...entryVal) : filterState.max >= entryVal;
			if (this._isAllowGreater) return isGtMin && (isLtMax || filterState.max === this._state.max);
			return isGtMin && isLtMax;
		}
	}

	addItem (item) {
		if (this._labels) {
			if (item == null) return;
			if (item instanceof Array) item.forEach(it => this.addItem(it));
			else if (!this._labels.some(it => it === item)) {
				this._labels.push(item);
				// Fake an update to trigger label handling
			}

			this._addItem_addNumber(this._labels.length - 1);
		} else {
			this._addItem_addNumber(item);
		}
	}

	_addItem_addNumber (number) {
		if (number == null || isNaN(number)) return;
		if (number >= this._state.min && number <= this._state.max) return; // it's already in the range
		if (this._state.min == null && this._state.max == null) this._state.min = this._state.max = number;
		else {
			const old = {...this.__state};

			if (number < old.min) this._state.min = number;
			if (number > old.max) this._state.max = number;

			// if the slider was previously at the full extent of its range, maintain this
			if (old.curMin === old.min) this._state.curMin = this._state.min;
			if (old.curMax === old.max) this._state.curMax = this._state.max;
		}
	}

	getDefaultMeta () {
		const out = {...RangeFilter._DEFAULT_META, ...super.getDefaultMeta()};
		if (Renderer.hover.isSmallScreen()) out.isUseDropdowns = true;
		return out;
	}
}
RangeFilter._DEFAULT_META = {
	isUseDropdowns: false
};

class MultiFilter extends FilterBase {
	constructor (opts) {
		super(opts);
		this._filters = opts.filters;
		this._isAddDropdownToggle = !!opts.isAddDropdownToggle;

		Object.assign(
			this.__state,
			{
				...MultiFilter._DETAULT_STATE,
				mode: opts.mode || MultiFilter._DETAULT_STATE.mode
			}
		);
		this._baseState = MiscUtil.copy(this.__state);
		this._state = this._getProxy("state", this.__state);
	}

	getChildFilters () {
		return [...this._filters, ...this._filters.map(f => f.getChildFilters())].flat();
	}

	getSaveableState () {
		const out = {
			[this.header]: {
				...this.getBaseSaveableState(),
				state: {...this.__state}
			}
		};
		this._filters.forEach(it => Object.assign(out, it.getSaveableState()));
		return out;
	}

	setStateFromLoaded (filterState) {
		if (filterState && filterState[this.header]) {
			const toLoad = filterState[this.header];
			this.setBaseStateFromLoaded(toLoad);
			Object.assign(this._state, toLoad.state);
			this._filters.forEach(it => it.setStateFromLoaded(filterState));
		}
	}

	getSubHashes () {
		const out = [];

		const baseMeta = this.getMetaSubHashes();
		if (baseMeta) out.push(...baseMeta);

		const anyNotDefault = Object.keys(MultiFilter._DETAULT_STATE).find(k => this._state[k] !== MultiFilter._DETAULT_STATE[k]);
		if (anyNotDefault) {
			const serState = Object.keys(MultiFilter._DETAULT_STATE).map(k => UrlUtil.mini.compress(this._state[k] === undefined ? MultiFilter._DEFAULT_META[k] : this._state[k]));
			out.push(UrlUtil.packSubHash(this.getSubHashPrefix("state", this.header), serState));
		}

		// each getSubHashes should return an array of arrays, or null
		// flatten any arrays of arrays into our array of arrays
		this._filters.map(it => it.getSubHashes()).filter(Boolean).forEach(it => out.push(...it));
		return out.length ? out : null;
	}

	setFromSubHashState (state) {
		this.setMetaFromSubHashState(state);

		let hasState = false;

		Object.entries(state).forEach(([k, vals]) => {
			const prop = FilterBase.getProp(k);
			if (prop === "state") {
				hasState = true;
				const data = vals.map(v => UrlUtil.mini.decompress(v));
				Object.keys(MultiFilter._DETAULT_STATE).forEach((k, i) => this._state[k] = data[i]);
			}
		});

		if (!hasState) this._reset();
	}

	setFromValues (values) {
		this._filters.forEach(it => it.setFromValues(values));
	}

	$render (opts) {
		const $btnAndOr = $(`<div class="fltr__group-comb-toggle text-muted"/>`)
			.click(() => this._state.mode = this._state.mode === "and" ? "or" : "and");
		const hookAndOr = () => $btnAndOr.text(`(group ${this._state.mode.toUpperCase()})`);
		this._addHook("state", "mode", hookAndOr);
		hookAndOr();

		const $children = this._filters.map((it, i) => it.$render({...opts, isMulti: true, isFirst: i === 0}));
		const $wrpChildren = $$`<div>${$children}</div>`;

		const $wrpSummary = $(`<div class="fltr__summary_item"/>`).hide();

		const $btnForceMobile = this._isAddDropdownToggle ? ComponentUiUtil.$getBtnBool(
			this,
			"isUseDropdowns",
			{
				$ele: $(`<button class="btn btn-default btn-xs ml-2">Show as Dropdowns</button>`),
				stateName: "meta",
				stateProp: "_meta"
			}
		) : null;
		// Propagate parent state to children
		const hkChildrenDropdowns = () => {
			this._filters
				.filter(it => it instanceof RangeFilter)
				.forEach(it => it.isUseDropdowns = this._meta.isUseDropdowns);
		};
		this._addHook("meta", "isUseDropdowns", hkChildrenDropdowns);
		hkChildrenDropdowns();

		const $btnResetAll = $(`<button class="btn btn-default btn-xs ml-2">Reset All</button>`)
			.click(() => this._filters.forEach(it => it.reset()));
		const $wrpBtns = $$`<div>${$btnForceMobile}${$btnResetAll}</div>`;

		const $btnShowHide = $(`<button class="btn btn-default btn-xs ml-2 ${this._meta.isHidden ? "active" : ""}">Hide</button>`)
			.click(() => this._meta.isHidden = !this._meta.isHidden);
		const $wrpControls = $$`<div class="flex-v-center">
			${$wrpSummary}${$wrpBtns}${$btnShowHide}
		</div>`;

		const hookShowHide = () => {
			$wrpBtns.toggle(!this._meta.isHidden);
			$btnShowHide.toggleClass("active", this._meta.isHidden);
			$wrpChildren.toggle(!this._meta.isHidden);
			$wrpSummary.toggle(this._meta.isHidden);

			const numActive = this._filters.map(it => it.getValues()[it.header]._isActive).filter(Boolean).length;
			if (numActive) {
				$wrpSummary
					.title(`${numActive} hidden active filter${numActive === 1 ? "" : "s"}`)
					.text(`(${numActive})`);
			}
		};
		this._addHook("meta", "isHidden", hookShowHide);
		hookShowHide();

		return $$`<div class="flex-col">
			${opts.isFirst ? "" : `<div class="fltr__dropdown-divider mb-1"/>`}
			<div class="split fltr__h fltr__h--multi ${this._minimalUi ? "fltr__minimal-hide" : ""} mb-1">
				<div class="flex-v-center">
					<div class="mr-2">${this.header}</div>
					${$btnAndOr}
				</div>
				${$wrpControls}
			</div>
			${$wrpChildren}
		</div>`;
	}

	/**
	 * @param vals Previously-read filter value may be passed in for performance.
	 */
	isActive (vals) {
		vals = vals || this.getValues();
		return this._filters.some(it => it.isActive(vals));
	}

	getValues () {
		const out = {};
		this._filters.forEach(it => Object.assign(out, it.getValues()));
		return out;
	}

	_reset () {
		Object.assign(this._state, this._baseState);
	}

	reset (isResetAll) {
		if (isResetAll) this.resetBase();
		this._reset();
		this._filters.forEach(it => it.reset(isResetAll));
	}

	resetShallow (isResetAll) {
		if (isResetAll) this.resetBase();
		this._reset();
	}

	update () {
		this._filters.forEach(it => it.update());
	}

	toDisplay (boxState, entryValArr) {
		if (this._filters.length !== entryValArr.length) throw new Error("Number of filters and number of values did not match");

		const results = [];
		for (let i = this._filters.length - 1; i >= 0; --i) {
			const f = this._filters[i];
			if (f instanceof RangeFilter) {
				results.push(f.toDisplay(boxState, entryValArr[i]))
			} else {
				const totals = boxState[f.header]._totals;

				if (totals.yes === 0 && totals.no === 0) results.push(null);
				else results.push(f.toDisplay(boxState, entryValArr[i]));
			}
		}

		const resultsActive = results.filter(r => r !== null);
		if (this._state.mode === "or") {
			if (!resultsActive.length) return true;
			return resultsActive.find(r => r);
		} else {
			return resultsActive.filter(r => r).length === resultsActive.length;
		}
	}

	addItem () { throw new Error(`Cannot add item to MultiFilter! Add the item to a child filter instead.`); }
}
MultiFilter._DETAULT_STATE = {
	mode: "or"
};

// validate subhash prefixes
(() => {
	const boxPrefixes = Object.values(FilterBox._SUB_HASH_PREFIXES).filter(it => it.length !== FilterUtil.SUB_HASH_PREFIX_LENGTH);
	const filterPrefixes = Object.values(FilterBase._SUB_HASH_PREFIXES).filter(it => it.length !== FilterUtil.SUB_HASH_PREFIX_LENGTH);
	const allPrefixes = boxPrefixes.concat(filterPrefixes);
	if (allPrefixes.length) throw new Error(`Invalid prefixes! ${allPrefixes.map(it => `"${it}"`).join(", ")} ${allPrefixes.length === 1 ? `is` : `was`} not of length ${FilterUtil.SUB_HASH_PREFIX_LENGTH}`);
})();
FilterUtil.SUB_HASH_PREFIXES = new Set([...Object.values(FilterBox._SUB_HASH_PREFIXES), ...Object.values(FilterBase._SUB_HASH_PREFIXES)]);

if (typeof module !== "undefined") {
	module.exports = {
		FilterUtil,
		PageFilter,
		FilterBox,
		FilterItem,
		FilterBase,
		Filter,
		SourceFilter,
		RangeFilter,
		MultiFilter
	};
}
