"use strict";

class Prx {
	static addHook (prop, hook) {
		this.px._hooks[prop] = this.px._hooks[prop] || [];
		this.px._hooks[prop].push(hook);
	}

	static addHookAll (hook) {
		this.px._hooksAll.push(hook);
	}

	static toString () {
		return JSON.stringify(this, (k, v) => k === "px" ? undefined : v);
	}

	static copy () {
		return JSON.parse(Prx.toString.bind(this)());
	}

	static get (toProxy) {
		toProxy.px = {
			addHook: Prx.addHook.bind(toProxy),
			addHookAll: Prx.addHookAll.bind(toProxy),
			toString: Prx.toString.bind(toProxy),
			copy: Prx.copy.bind(toProxy),
			_hooksAll: [],
			_hooks: {}
		};

		return new Proxy(toProxy, {
			set: (object, prop, value) => {
				object[prop] = value;
				toProxy.px._hooksAll.forEach(hook => hook(prop, value));
				if (toProxy.px._hooks[prop]) toProxy.px._hooks[prop].forEach(hook => hook(prop, value));
				return true;
			},
			deleteProperty: (object, prop) => {
				delete object[prop];
				toProxy.px._hooksAll.forEach(hook => hook(prop, null));
				if (toProxy.px._hooks[prop]) toProxy.px._hooks[prop].forEach(hook => hook(prop, null));
				return true;
			}
		});
	}
}

class ProxyBase {
	constructor () {
		this.__hooks = {};
		this.__hooksAll = {};
		this.__hooksTmp = null;
		this.__hooksAllTmp = null;
	}

	_getProxy (hookProp, toProxy) {
		return new Proxy(toProxy, {
			set: (object, prop, value) => {
				object[prop] = value;
				if (this.__hooksAll[hookProp]) this.__hooksAll[hookProp].forEach(hook => hook(prop, value));
				if (this.__hooks[hookProp] && this.__hooks[hookProp][prop]) this.__hooks[hookProp][prop].forEach(hook => hook(prop, value));
				return true;
			},
			deleteProperty: (object, prop) => {
				delete object[prop];
				if (this.__hooksAll[hookProp]) this.__hooksAll[hookProp].forEach(hook => hook(prop, null));
				if (this.__hooks[hookProp] && this.__hooks[hookProp][prop]) this.__hooks[hookProp][prop].forEach(hook => hook(prop, null));
				return true;
			}
		});
	}

	/**
	 * Register a hook versus a root property on the state object. **INTERNAL CHANGES TO CHILD OBJECTS ON THE STATE
	 *   OBJECT ARE NOT TRACKED**.
	 * @param hookProp The state object.
	 * @param prop The root property to track.
	 * @param hook The hook to run. Will be called with two arguments; the property and the value of the property being
	 *   modified.
	 */
	_addHook (hookProp, prop, hook) {
		ProxyBase._addHook_to(this.__hooks, hookProp, prop, hook);
		if (this.__hooksTmp) ProxyBase._addHook_to(this.__hooksTmp, hookProp, prop, hook);
	}

	static _addHook_to (obj, hookProp, prop, hook) {
		((obj[hookProp] = obj[hookProp] || {})[prop] = (obj[hookProp][prop] || [])).push(hook);
	}

	_addHookAll (hookProp, hook) {
		ProxyBase._addHookAll_to(this.__hooksAll, hookProp, hook);
		if (this.__hooksAllTmp) ProxyBase._addHookAll_to(this.__hooksAllTmp, hookProp, hook)
	}

	static _addHookAll_to (obj, hookProp, hook) {
		(obj[hookProp] = obj[hookProp] || []).push(hook);
	}

	_removeHook (hookProp, prop, hook) {
		ProxyBase._removeHook_from(this.__hooks, hookProp, prop, hook);
		if (this.__hooksTmp) ProxyBase._removeHook_from(this.__hooksTmp, hookProp, prop, hook);
	}

	static _removeHook_from (obj, hookProp, prop, hook) {
		if (obj[hookProp] && obj[hookProp][prop]) {
			const ix = obj[hookProp][prop].findIndex(hk => hk === hook);
			if (~ix) obj[hookProp][prop].splice(ix, 1);
		}
	}

	_removeHookAll (hookProp, hook) {
		ProxyBase._removeHookAll_from(this.__hooksAll, hookProp, hook);
		if (this.__hooksAllTmp) ProxyBase._removeHook_from(this.__hooksAllTmp, hookProp, hook);
	}

	static _removeHookAll_from (obj, hookProp, hook) {
		if (obj[hookProp]) {
			const ix = obj[hookProp].findIndex(hk => hk === hook);
			if (~ix) obj[hookProp].splice(ix, 1);
		}
	}

	_resetHooks (hookProp) {
		if (hookProp !== undefined) delete this.__hooks[hookProp];
		else Object.keys(this.__hooks).forEach(prop => delete this.__hooks[prop]);
	}

	_resetHooksAll (hookProp) {
		if (hookProp !== undefined) delete this.__hooksAll[hookProp];
		else Object.keys(this.__hooksAll).forEach(prop => delete this.__hooksAll[prop]);
	}

	_saveHookCopiesTo (obj) { this.__hooksTmp = obj; }
	_saveHookAllCopiesTo (obj) { this.__hooksAllTmp = obj; }

	/**
	 * Object.assign equivalent, overwrites values on the current proxied object with some new values,
	 *   then trigger all the appropriate event handlers.
	 * @param hookProp Hook property, e.g. "state".
	 * @param proxyProp Proxied object property, e.g. "_state".
	 * @param underProp Underlying object property, e.g. "__state".
	 * @param toObj
	 * @param isOverwrite If the overwrite should clean/delete all data from the object beforehand.
	 */
	_proxyAssign (hookProp, proxyProp, underProp, toObj, isOverwrite) {
		const oldKeys = Object.keys(this[proxyProp]);
		const nuKeys = new Set(Object.keys(toObj));
		const dirtyKeys = new Set();

		if (isOverwrite) {
			oldKeys.forEach(k => {
				if (!nuKeys.has(k) && this[underProp] !== undefined) {
					delete this[underProp][k];
					dirtyKeys.add(k);
				}
			});
		}

		nuKeys.forEach(k => {
			if (!CollectionUtil.deepEquals(this[underProp][k], toObj[k])) {
				this[underProp][k] = toObj[k];
				dirtyKeys.add(k);
			}
		});

		dirtyKeys.forEach(k => {
			if (this.__hooksAll[hookProp]) this.__hooksAll[hookProp].forEach(hk => hk(k, this[underProp][k]));
			if (this.__hooks[hookProp] && this.__hooks[hookProp][k]) this.__hooks[hookProp][k].forEach(hk => hk(k, this[underProp][k]));
		});
	}
}

class UiUtil {
	/**
	 * @param string String to parse.
	 * @param [fallbackEmpty] Fallback number if string is empty.
	 * @param [opts] Options Object.
	 * @param [opts.max] Max allowed return value.
	 * @param [opts.min] Min allowed return value.
	 * @param [opts.fallbackOnNaN] Return value if not a number.
	 */
	static strToInt (string, fallbackEmpty = 0, opts) { return UiUtil._strToNumber(string, fallbackEmpty, opts, true) }

	/**
	 * @param string String to parse.
	 * @param [fallbackEmpty] Fallback number if string is empty.
	 * @param [opts] Options Object.
	 * @param [opts.max] Max allowed return value.
	 * @param [opts.min] Min allowed return value.
	 * @param [opts.fallbackOnNaN] Return value if not a number.
	 */
	static strToNumber (string, fallbackEmpty = 0, opts) { return UiUtil._strToNumber(string, fallbackEmpty, opts, false) }

	static _strToNumber (string, fallbackEmpty = 0, opts, isInt) {
		opts = opts || {};
		let out;
		string = string.trim();
		if (!string) out = fallbackEmpty;
		else {
			const num = UiUtil._parseStrAsNumber(string, isInt);
			out = isNaN(num) || !isFinite(num)
				? opts.fallbackOnNaN !== undefined ? opts.fallbackOnNaN : 0
				: num;
		}
		if (opts.max != null) out = Math.min(out, opts.max);
		if (opts.min != null) out = Math.max(out, opts.min);
		return out;
	}

	/**
	 * @param string String to parse.
	 * @param [fallbackEmpty] Fallback value if string is empty.
	 * @param [opts] Options Object.
	 * @param [opts.fallbackOnNaB] Return value if not a boolean.
	 */
	static strToBool (string, fallbackEmpty = null, opts) {
		opts = opts || {};
		if (!string) return fallbackEmpty;
		string = string.trim().toLowerCase();
		if (!string) return fallbackEmpty;
		return string === "true" ? true : string === "false" ? false : opts.fallbackOnNaB;
	}

	static intToBonus (int) { return `${int >= 0 ? "+" : ""}${int}`; }

	static getEntriesAsText (entryArray) {
		if (!entryArray || !entryArray.length) return "";
		return JSON.stringify(entryArray, null, 2)
			.replace(/^\s*\[/, "").replace(/]\s*$/, "")
			.split("\n")
			.filter(it => it.trim())
			.map(it => {
				const trim = it.replace(/^\s\s/, "");
				const mQuotes = /^"(.*?)",?$/.exec(trim);
				if (mQuotes) return mQuotes[1]; // if string, strip quotes
				else return `  ${trim}`; // if object, indent
			})
			.join("\n")
	}

	static getTextAsEntries (text) {
		try {
			const lines = [];
			text.split("\n").filter(it => it.trim()).forEach(it => {
				if (/^\s/.exec(it)) lines.push(it); // keep indented lines as-is
				else lines.push(`"${it.replace(/"/g, `\\"`)}",`); // wrap strings
			});
			if (lines.length) lines[lines.length - 1] = lines.last().replace(/^(.*?),?$/, "$1"); // remove trailing comma
			return JSON.parse(`[${lines.join("")}]`);
		} catch (e) {
			const lines = text.split("\n").filter(it => it.trim());
			const slice = lines.join(" \\ ").substring(0, 30);
			JqueryUtil.doToast({
				content: `Could not parse entries! Error was: ${e.message}<br>Text was: ${slice}${slice.length === 30 ? "..." : ""}`,
				type: "danger"
			});
			return lines;
		}
	}

	/**
	 * @param {Object} [opts] Options object.
	 * @param {string} [opts.title] Modal title.
	 * @param {boolean} [opts.fullHeight] If the modal should take up (almost) the full height of the screen.
	 * @param {boolean} [opts.isLarge] If the modal should have (almost) unrestrained dimensions
	 * @param {boolean} [opts.noMinHeight] If the modal should have no minimum height.
	 * @param {function} [opts.cbClose] Callback run when the modal is closed.
	 * @param {JQuery} [opts.titleSplit] Element to have split alongside the title.
	 * @param {int} [opts.zIndex] Z-index of the modal.
	 * @param {number} [opts.overlayColor] Overlay color.
	 * @param {boolean} [opts.isPermanent] If the modal should be impossible to close.
	 * @returns {object}
	 */
	static getShowModal (opts) {
		opts = opts || {};

		UiUtil._initModalEscapeHandler();
		$(document.activeElement).blur(); // blur any active element as it will be behind the modal

		// if the user closed the modal by clicking the "cancel" background, isDataEntered is false
		const handleCloseClick = async (isDataEntered, ...args) => {
			if (opts.cbClose) await opts.cbClose(isDataEntered, ...args);
			$modal.remove();

			const ixStack = UiUtil._MODAL_STACK.indexOf(modalStackMeta);
			if (~ixStack) UiUtil._MODAL_STACK.splice(ixStack, 1);
		};

		const $modal = $(`<div class="ui-modal__overlay">`);
		if (opts.zIndex != null) $modal.css({zIndex: opts.zIndex});
		if (opts.overlayColor != null) $modal.css({backgroundColor: opts.overlayColor});
		const $scroller = $(`<div class="ui-modal__scroller flex-col"/>`);
		const $modalInner = $$`<div class="ui-modal__inner flex-col dropdown-menu ${opts.isLarge ? `ui-modal__inner--large ` : ""}${opts.fullHeight ? "h-100" : ""}">
			<div class="split-v-center no-shrink">
				${opts.title ? `<h4>${opts.title.escapeQuotes()}</h4>` : ""}${opts.titleSplit || ""}
			</div>
			${$scroller}
		</div>`
			.appendTo($modal);
		if (opts.noMinHeight) $modalInner.css("height", "initial");

		$modal.click(evt => {
			if (evt.target === $modal[0]) {
				if (opts.isPermanent) return;
				handleCloseClick(false);
			}
		});

		$(document.body).append($modal);

		const modalStackMeta = {
			isPermanent: opts.isPermanent,
			handleCloseClick
		};
		UiUtil._MODAL_STACK.push(modalStackMeta);

		return {
			$modalInner: $scroller,
			doClose: handleCloseClick
		};
	}

	static _initModalEscapeHandler () {
		if (UiUtil._MODAL_STACK) return;
		UiUtil._MODAL_STACK = [];

		$(document.body).keydown(evt => {
			if (UiUtil._MODAL_STACK.length && evt.target === document.body && evt.which === 27) {
				const outerModalMeta = UiUtil._MODAL_STACK.last();
				if (!outerModalMeta.isPermanent) outerModalMeta.handleCloseClick(false);
			}
		});
	}

	static addModalSep ($modalInner) {
		$modalInner.append(`<hr class="ui-modal__row-sep">`);
	}

	static $getAddModalRow ($modalInner, tag = "div") {
		return $(`<${tag} class="ui-modal__row"/>`).appendTo($modalInner);
	}

	/**
	 * @param $modalInner Element this row should be added to.
	 * @param headerText Header text.
	 * @param [opts] Options object.
	 * @param [opts.helpText] Help text (title) of select dropdown.
	 * @param [opts.$eleRhs] Element to attach to the right-hand side of the header.
	 */
	static $getAddModalRowHeader ($modalInner, headerText, opts) {
		opts = opts || {};
		const $row = UiUtil.$getAddModalRow($modalInner, "h5").addClass("bold");
		if (opts.$eleRhs) $$`<div class="split flex-v-center w-100 pr-1"><span>${headerText}</span>${opts.$eleRhs}</div>`.appendTo($row);
		else $row.text(headerText);
		if (opts.helpText) $row.title(opts.helpText);
		return $row;
	}

	static $getAddModalRowCb ($modalInner, labelText, objectWithProp, propName, helpText) {
		const $row = UiUtil.$getAddModalRow($modalInner, "label").addClass(`ui-modal__row--cb`);
		if (helpText) $row.title(helpText);
		$row.append(`<span>${labelText}</span>`);
		const $cb = $(`<input type="checkbox">`).appendTo($row)
			.prop("checked", objectWithProp[propName])
			.on("change", () => objectWithProp[propName] = $cb.prop("checked"));
		return $cb;
	}

	/**
	 *
	 * @param $modalInner Element this row should be added to.
	 * @param labelText Row label.
	 * @param objectWithProp Object to mutate when changing select values.
	 * @param propName Property to set in `objectWithProp`.
	 * @param values Values to display in select dropdown.
	 * @param [opts] Options object.
	 * @param [opts.helpText] Help text (title) of select dropdown.
	 * @param [opts.fnDisplay] Function used to map values to displayable versions.
	 */
	static $getAddModalRowSel ($modalInner, labelText, objectWithProp, propName, values, opts) {
		opts = opts || {};
		const $row = UiUtil.$getAddModalRow($modalInner, "label").addClass(`ui-modal__row--sel`);
		if (opts.helpText) $row.title(opts.helpText);
		$row.append(`<span>${labelText}</span>`);
		const $sel = $(`<select class="form-control input-xs w-30">`).appendTo($row);
		values.forEach((val, i) => $(`<option value="${i}"/>`).text(opts.fnDisplay ? opts.fnDisplay(val) : val).appendTo($sel));
		// N.B. this doesn't support null values
		const ix = values.indexOf(objectWithProp[propName]);
		$sel.val(`${~ix ? ix : 0}`)
			.change(() => objectWithProp[propName] = values[$sel.val()]);
		return $sel;
	}

	static _parseStrAsNumber (str, isInt) {
		const tree = Renderer.dice.lang.getTree3(str);
		if (!tree) return NaN;
		const out = tree.evl({});
		if (!isNaN(out) && isInt) return Math.round(out);
		return out;
	}
}
UiUtil.SEARCH_RESULTS_CAP = 75;
UiUtil.TYPE_TIMEOUT_MS = 100; // auto-search after 100ms
UiUtil._MODAL_STACK = null;

class ProfUiUtil {
	/**
	 * @param state Initial state.
	 * @param [opts] Options object.
	 * @param [opts.isSimple] If the cycler only has "not proficient" and "proficient" options
	 */
	static getProfCycler (state = 0, opts) {
		opts = opts || {};

		const STATES = opts.isSimple ? Object.keys(ProfUiUtil.PROF_TO_FULL).slice(0, 2) : Object.keys(ProfUiUtil.PROF_TO_FULL);

		const NUM_STATES = Object.keys(STATES).length;

		// validate initial state
		state = Number(state) || 0;
		if (state >= NUM_STATES) state = NUM_STATES - 1;
		else if (state < 0) state = 0;

		const $btnCycle = $(`<button class="ui-prof__btn-cycle"/>`)
			.click(() => {
				$btnCycle
					.attr("data-state", ++state >= NUM_STATES ? state = 0 : state)
					.title(ProfUiUtil.PROF_TO_FULL[state].name)
					.trigger("change");
			})
			.contextmenu(evt => {
				evt.preventDefault();
				$btnCycle
					.attr("data-state", --state < 0 ? state = NUM_STATES - 1 : state)
					.title(ProfUiUtil.PROF_TO_FULL[state].name)
					.trigger("change");
			});
		const setState = (nuState) => {
			state = nuState;
			if (state > NUM_STATES) state = 0;
			else if (state < 0) state = NUM_STATES - 1;
			$btnCycle.attr("data-state", state).title(ProfUiUtil.PROF_TO_FULL[state].name);
		};
		return {
			$ele: $btnCycle,
			setState,
			getState: () => state
		}
	}
}
ProfUiUtil.PROF_TO_FULL = {
	"0": {
		name: "No proficiency",
		mult: 0
	},
	"1": {
		name: "Proficiency",
		mult: 1
	},
	"2": {
		name: "Expertise",
		mult: 2
	},
	"3": {
		name: "Half proficiency",
		mult: 0.5
	}
};

class TabUiUtil {
	static decorate (obj) {
		obj.__tabMetas = {};

		/**
		 * @param ix The tabs ordinal index.
		 * @param name The name to display on the tab.
		 * @param opts Options object.
		 * @param opts.tabGroup User-defined string identifying which group of tabs this belongs to.
		 * @param opts.stateObj The state object in which this tab should track/set its active status. Usually a proxy.
		 * @param [opts.hasBorder] True if the tab should compensate for having a top border; i.e. pad itself.
		 * @param [opts.cbTabChange] Callback function to call on tab change.
		 */
		obj._getTab = function (ix, name, opts) {
			opts.tabGroup = opts.tabGroup || "_default";

			const activeProp = `activeTab__${opts.tabGroup}`;

			if (!obj.__tabMetas[opts.tabGroup]) obj.__tabMetas[opts.tabGroup] = [];
			const tabMeta = obj.__tabMetas[opts.tabGroup];
			opts.stateObj[activeProp] = opts.stateObj[activeProp] || 0;

			const isActive = opts.stateObj[activeProp] === ix;

			const $btnTab = $(`<button class="btn btn-default stat-tab ${isActive ? "stat-tab-sel" : ""}">${name}</button>`)
				.click(() => {
					const prevTab = tabMeta[opts.stateObj[activeProp]];
					prevTab.$btnTab.removeClass("stat-tab-sel");
					prevTab.$wrpTab.toggleClass("hidden", true);

					opts.stateObj[activeProp] = ix;
					$btnTab.addClass("stat-tab-sel");
					$wrpTab.toggleClass("hidden", false);
					if (opts.cbTabChange) opts.cbTabChange();
				});

			const $wrpTab = $(`<div class="ui-tab__wrp-tab-body ${isActive ? "" : "hidden"} ${opts.hasBorder ? "ui-tab__wrp-tab-body--border" : ""}"/>`);

			const out = {ix, $btnTab, $wrpTab};
			tabMeta[ix] = out;
			return out;
		};

		obj._resetTabs = function (tabGroup) {
			tabGroup = tabGroup || "_default";
			obj.__tabMetas[tabGroup] = [];
		};
	}
}

// TODO have this respect the blacklist?
class SearchUiUtil {
	static async pDoGlobalInit () {
		elasticlunr.clearStopWords();
		await Renderer.item.populatePropertyAndTypeReference();
	}

	static _isNoHoverCat (cat) {
		return SearchUiUtil.NO_HOVER_CATEGORIES.has(cat);
	}

	static async pGetContentIndices (options) {
		options = options || {};

		const availContent = {};

		const data = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index.json`));

		const additionalData = {};
		if (options.additionalIndices) {
			await Promise.all(options.additionalIndices.map(async add => {
				additionalData[add] = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index-${add}.json`));
				const maxId = additionalData[add].last().id;
				const brewIndex = await BrewUtil.pGetAdditionalSearchIndices(maxId, add);
				if (brewIndex.length) additionalData[add] = additionalData[add].concat(brewIndex);
			}));
		}

		const alternateData = {};
		if (options.alternateIndices) {
			await Promise.all(options.alternateIndices.map(async alt => {
				alternateData[alt] = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index-alt-${alt}.json`));
				const maxId = alternateData[alt].last().id;
				const brewIndex = await BrewUtil.pGetAlternateSearchIndices(maxId, alt);
				if (brewIndex.length) alternateData[alt] = alternateData[alt].concat(brewIndex);
			}));
		}

		const fromDeepIndex = (d) => d.d; // flag for "deep indexed" content that refers to the same item

		availContent.ALL = elasticlunr(function () {
			this.addField("n");
			this.addField("s");
			this.setRef("id");
		});
		SearchUtil.removeStemmer(availContent.ALL);

		// Add main site index
		let ixMax = 0;

		const initIndexForFullCat = (doc) => {
			if (!availContent[doc.cf]) {
				availContent[doc.cf] = elasticlunr(function () {
					this.addField("n");
					this.addField("s");
					this.setRef("id");
				});
				SearchUtil.removeStemmer(availContent[doc.cf]);
			}
		};

		const handleDataItem = (d, isAlternate) => {
			if (SearchUiUtil._isNoHoverCat(d.c) || fromDeepIndex(d)) return;
			d.cf = d.c === Parser.CAT_ID_CREATURE ? "Creature" : Parser.pageCategoryToFull(d.c);
			if (isAlternate) d.cf = `alt_${d.cf}`;
			initIndexForFullCat(d);
			if (!isAlternate) availContent.ALL.addDoc(d);
			availContent[d.cf].addDoc(d);
			ixMax = Math.max(ixMax, d.id);
		};

		data.forEach(d => handleDataItem(d));
		Object.values(additionalData).forEach(arr => arr.forEach(d => handleDataItem(d)));
		Object.values(alternateData).forEach(arr => arr.forEach(d => handleDataItem(d, true)));

		// Add homebrew
		Omnisearch.highestId = Math.max(ixMax, Omnisearch.highestId);

		const brewIndex = await BrewUtil.pGetSearchIndex();

		brewIndex.forEach(d => {
			if (SearchUiUtil._isNoHoverCat(d.c) || fromDeepIndex(d)) return;
			d.cf = Parser.pageCategoryToFull(d.c);
			d.cf = d.c === Parser.CAT_ID_CREATURE ? "Creature" : Parser.pageCategoryToFull(d.c);
			initIndexForFullCat(d);
			availContent.ALL.addDoc(d);
			availContent[d.cf].addDoc(d);
		});

		return availContent;
	}
}
SearchUiUtil.NO_HOVER_CATEGORIES = new Set([
	Parser.CAT_ID_ADVENTURE,
	Parser.CAT_ID_QUICKREF
]);

// based on DM screen's AddMenuSearchTab
class SearchWidget {
	static getSearchNoResults () {
		return `<div class="ui-search__message"><i>No results.</i></div>`;
	}

	static getSearchLoading () {
		return `<div class="ui-search__message"><i>\u2022\u2022\u2022</i></div>`;
	}

	static getSearchEnter () {
		return `<div class="ui-search__message"><i>Enter a search.</i></div>`;
	}

	/**
	 * @param $iptSearch input element
	 * @param opts Options object.
	 * @param opts.fnSearch Function which runs the search.
	 * @param opts.fnShowWait Function which displays loading dots
	 * @param opts.flags Flags object; modified during user interaction.
	 * @param opts.flags.isWait Flag tracking "waiting for user to stop typing"
	 * @param opts.flags.doClickFirst Flag tracking "should first result get clicked"
	 * @param opts.flags.doClickFirst Flag tracking "should first result get clicked"
	 * @param opts.$ptrRows Pointer to array of rows.
	 */
	static bindAutoSearch ($iptSearch, opts) {
		SearchWidget.bindTypingEnd({
			$iptSearch,
			fnKeyup: () => {
				opts.fnSearch();
			},
			fnKeypress: evt => {
				if (evt.which === 13) {
					opts.flags.doClickFirst = true;
					opts.fnSearch();
				}
			},
			fnKeydown: evt => {
				if (opts.flags.isWait) {
					opts.flags.isWait = false;
					opts.fnShowWait();
				} else {
					switch (evt.which) {
						case 40: { // down
							if (opts.$ptrRows && opts.$ptrRows._[0]) {
								evt.preventDefault();
								opts.$ptrRows._[0].focus();
							}
						}
					}
				}
			},
			fnClick: () => {
				if ($iptSearch.val() && $iptSearch.val().trim().length) opts.fnSearch();
			}
		});
	}

	static bindTypingEnd ({$iptSearch, fnKeyup, fnKeypress, fnKeydown, fnClick} = {}) {
		let timerTyping;
		$iptSearch
			.on("keyup search", evt => {
				clearTimeout(timerTyping);
				timerTyping = setTimeout(() => { fnKeyup(evt); }, UiUtil.TYPE_TIMEOUT_MS);
			})
			.on("keypress", (e) => {
				if (fnKeypress) fnKeypress(e);
			})
			.on("keydown", evt => {
				if (fnKeydown) fnKeydown(evt);
				clearTimeout(timerTyping);
			})
			.on("click", () => {
				if (fnClick) fnClick();
			});
	}

	static bindRowHandlers ({result, $row, $ptrRows, fnHandleClick}) {
		return $row
			.keydown(evt => {
				switch (evt.which) {
					case 13: { // enter
						return fnHandleClick(result);
					}
					case 38: { // up
						evt.preventDefault();
						const ixRow = $ptrRows._.indexOf($row);
						const $prev = $ptrRows._[ixRow - 1];
						if ($prev) $prev.focus();
						else $ptrRows.focus();
						break;
					}
					case 40: { // down
						evt.preventDefault();
						const ixRow = $ptrRows._.indexOf($row);
						const $nxt = $ptrRows._[ixRow + 1];
						if ($nxt) $nxt.focus();
						break;
					}
				}
			})
			.click(() => fnHandleClick(result));
	}

	/**
	 * @param indexes An object with index names (categories) as the keys, and indexes as the values.
	 * @param cbSearch Callback to run on user clicking a search result.
	 * @param options Options object.
	 * @param options.defaultCategory Default search category.
	 * @param options.resultFilter Function which takes a document and returns false if it is to be filtered out of the results.
	 * @param options.searchOptions Override for default elasticlunr search options.
	 * @param options.fnTransform Override for default document transformation before being passed to cbSearch.
	 */
	constructor (indexes, cbSearch, options) {
		options = options || {};

		this._indexes = indexes;
		this._cat = options.defaultCategory || "ALL";
		this._cbSearch = cbSearch;
		this._resultFilter = options.resultFilter || null;
		this._searchOptions = options.searchOptions || null;
		this._fnTransform = options.fnTransform || null;

		this._flags = {
			doClickFirst: false,
			isWait: false
		};
		this._$ptrRows = {_: []};

		this._$selCat = null;
		this._$iptSearch = null;
		this._$wrpResults = null;

		this._$rendered = null;
	}

	static pDoGlobalInit () {
		if (!SearchWidget.P_LOADING_CONTENT) {
			SearchWidget.P_LOADING_CONTENT = (async () => {
				Object.assign(SearchWidget.CONTENT_INDICES, await SearchUiUtil.pGetContentIndices({additionalIndices: ["item"], alternateIndices: ["spell"]}));
			})();
		}
		return SearchWidget.P_LOADING_CONTENT;
	}

	__getSearchOptions () {
		return this._searchOptions || {
			fields: {
				n: {boost: 5, expand: true},
				s: {expand: true}
			},
			bool: "AND",
			expand: true
		};
	}

	__$getRow (r) {
		return $(`<div class="ui-search__row" tabindex="0">
			<span>${r.doc.n}</span>
			<span>${r.doc.s ? `<i title="${Parser.sourceJsonToFull(r.doc.s)}">${Parser.sourceJsonToAbv(r.doc.s)}${r.doc.p ? ` p${r.doc.p}` : ""}</i>` : ""}</span>
		</div>`);
	}

	static __getAllTitle () {
		return "All Categories";
	}

	static __getCatOptionText (it) {
		return it;
	}

	get $wrpSearch () {
		if (!this._$rendered) this._render();
		return this._$rendered
	}

	__showMsgInputRequired () {
		this._flags.isWait = true;
		this._$wrpResults.empty().append(SearchWidget.getSearchEnter());
	}

	__showMsgWait () {
		this._$wrpResults.empty().append(SearchWidget.getSearchLoading())
	}

	__showMsgNoResults () {
		this._flags.isWait = true;
		this._$wrpResults.empty().append(SearchWidget.getSearchEnter());
	}

	__doSearch () {
		const searchInput = this._$iptSearch.val().trim();

		const index = this._indexes[this._cat];
		const results = index.search(searchInput, this.__getSearchOptions());

		const {toProcess, resultCount} = (() => {
			if (results.length) {
				if (this._resultFilter) {
					const filtered = results.filter(it => this._resultFilter(it.doc));
					return {
						toProcess: filtered.slice(0, UiUtil.SEARCH_RESULTS_CAP),
						resultCount: filtered.length
					}
				} else {
					return {
						toProcess: results.slice(0, UiUtil.SEARCH_RESULTS_CAP),
						resultCount: results.length
					}
				}
			} else {
				if (this._resultFilter) {
					const filtered = Object.values(index.documentStore.docs).filter(it => this._resultFilter(it)).map(it => ({doc: it}));
					return {
						toProcess: filtered.slice(0, UiUtil.SEARCH_RESULTS_CAP),
						resultCount: filtered.length
					}
				} else {
					return {
						toProcess: Object.values(index.documentStore.docs).slice(0, UiUtil.SEARCH_RESULTS_CAP).map(it => ({doc: it})),
						resultCount: Object.values(index.documentStore.docs).length
					}
				}
			}
		})();

		this._$wrpResults.empty();
		this._$ptrRows._ = [];

		if (toProcess.length) {
			const handleClick = (r) => {
				if (this._fnTransform) this._cbSearch(this._fnTransform(r.doc));
				else {
					const page = UrlUtil.categoryToPage(r.doc.c);
					const source = r.doc.s;
					const hash = r.doc.u;

					this._cbSearch(page, source, hash);
				}
			};

			if (this._flags.doClickFirst) {
				handleClick(toProcess[0]);
				this._flags.doClickFirst = false;
				return;
			}

			const res = toProcess.slice(0, UiUtil.SEARCH_RESULTS_CAP);

			res.forEach(r => {
				const $row = this.__$getRow(r).appendTo(this._$wrpResults);
				SearchWidget.bindRowHandlers({result: r, $row, $ptrRows: this._$ptrRows, fnHandleClick: handleClick});
				this._$ptrRows._.push($row);
			});

			if (resultCount > UiUtil.SEARCH_RESULTS_CAP) {
				const diff = resultCount - UiUtil.SEARCH_RESULTS_CAP;
				this._$wrpResults.append(`<div class="ui-search__row ui-search__row--readonly">...${diff} more result${diff === 1 ? " was" : "s were"} hidden. Refine your search!</div>`);
			}
		} else {
			if (!searchInput.trim()) this.__showMsgInputRequired();
			else this.__showMsgNoResults();
		}
	}

	_render () {
		if (!this._$rendered) {
			this._$rendered = $(`<div class="ui-search__wrp-output"/>`);
			const $wrpControls = $(`<div class="ui-search__wrp-controls"/>`).appendTo(this._$rendered);

			this._$selCat = $(`<select class="form-control ui-search__sel-category">
				<option value="ALL">${SearchWidget.__getAllTitle()}</option>
				${Object.keys(this._indexes).sort().filter(it => it !== "ALL").map(it => `<option value="${it}">${SearchWidget.__getCatOptionText(it)}</option>`).join("")}
			</select>`)
				.appendTo($wrpControls).toggle(Object.keys(this._indexes).length !== 1)
				.on("change", () => {
					this._cat = this._$selCat.val();
					this.__doSearch();
				});

			this._$iptSearch = $(`<input class="ui-search__ipt-search search form-control" autocomplete="off" placeholder="Search...">`).appendTo($wrpControls);
			this._$wrpResults = $(`<div class="ui-search__wrp-results"/>`).appendTo(this._$rendered);

			SearchWidget.bindAutoSearch(this._$iptSearch, {
				flags: this._flags,
				fnSearch: this.__doSearch.bind(this),
				fnShowWait: this.__showMsgWait.bind(this),
				$ptrRows: this._$ptrRows
			});

			this.__doSearch();
		}
	}

	doFocus () {
		this._$iptSearch.focus();
	}

	static addToIndexes (prop, entry) {
		const nextId = Object.values(SearchWidget.CONTENT_INDICES.ALL.documentStore.docs).length;

		const indexer = new Omnidexer(nextId);

		const toIndex = {[prop]: [entry]};

		Omnidexer.TO_INDEX__FROM_INDEX_JSON.filter(it => it.listProp === prop)
			.forEach(it => indexer.addToIndex(it, toIndex));
		Omnidexer.TO_INDEX.filter(it => it.listProp === prop)
			.forEach(it => indexer.addToIndex(it, toIndex));

		const toAdd = Omnidexer.decompressIndex(indexer.getIndex());
		toAdd.forEach(d => {
			d.cf = d.c === Parser.CAT_ID_CREATURE ? "Creature" : Parser.pageCategoryToFull(d.c);
			SearchWidget.CONTENT_INDICES.ALL.addDoc(d);
			SearchWidget.CONTENT_INDICES[d.cf].addDoc(d);
		});
	}

	// region entity searches
	static async pGetUserSpellSearch (opts) {
		opts = opts || {};
		await SearchWidget.P_LOADING_CONTENT;

		const nxtOpts = {};
		if (opts.level != null) nxtOpts.resultFilter = result => result.lvl === opts.level;
		const tagBuilder = (encName, encSource) => `{@spell ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		const title = opts.level === 0 ? "Select Cantrip" : "Select Spell";
		return SearchWidget.pGetUserEntitySearch(title, "alt_Spell", tagBuilder, nxtOpts);
	}

	static async pGetUserFeatSearch () {
		// FIXME convert to be more like spell/creature search instead of running custom indexes
		await SearchWidget.pLoadCustomIndex("entity_Feats", `${Renderer.get().baseUrl}data/feats.json`, "feat", Parser.CAT_ID_FEAT, UrlUtil.PG_FEATS, "feats");

		const tagBuilder = (encName, encSource) => `{@feat ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		return SearchWidget.pGetUserEntitySearch("Select Feat", "entity_Feats", tagBuilder);
	}

	static async pGetUserBackgroundSearch () {
		// FIXME convert to be more like spell/creature search instead of running custom indexes
		await SearchWidget.pLoadCustomIndex("entity_Backgrounds", `${Renderer.get().baseUrl}data/backgrounds.json`, "background", Parser.CAT_ID_BACKGROUND, UrlUtil.PG_BACKGROUNDS, "backgrounds");

		const tagBuilder = (encName, encSource) => `{@background ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		return SearchWidget.pGetUserEntitySearch("Select Background", "entity_Backgrounds", tagBuilder);
	}

	static async pGetUserRaceSearch () {
		// FIXME convert to be more like spell/creature search instead of running custom indexes
		const dataSource = async () => {
			const raceJson = await DataUtil.loadJSON(`${Renderer.get().baseUrl}data/races.json`);
			const raceData = Renderer.race.mergeSubraces(raceJson.race);
			return {race: raceData};
		};
		await SearchWidget.pLoadCustomIndex("entity_Races", dataSource, "race", Parser.CAT_ID_RACE, UrlUtil.PG_RACES, "races");

		const tagBuilder = (encName, encSource) => `{@race ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		return SearchWidget.pGetUserEntitySearch("Select Race", "entity_Races", tagBuilder);
	}

	static async pGetUserOptionalFeatureSearch () {
		// FIXME convert to be more like spell/creature search instead of running custom indexes
		await SearchWidget.pLoadCustomIndex("entity_OptionalFeatures", `${Renderer.get().baseUrl}data/optionalfeatures.json`, "optionalfeature", Parser.CAT_ID_OPTIONAL_FEATURE_OTHER, UrlUtil.PG_OPT_FEATURES, "optional features");

		const tagBuilder = (encName, encSource) => `{@optfeature ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		return SearchWidget.pGetUserEntitySearch("Select Optional Feature", "entity_OptionalFeatures", tagBuilder);
	}

	static async pGetUserCreatureSearch () {
		await SearchWidget.P_LOADING_CONTENT;
		const nxtOpts = {};
		const tagBuilder = (encName, encSource) => `{@creature ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_PHB) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		return SearchWidget.pGetUserEntitySearch("Select Creature", "Creature", tagBuilder, nxtOpts);
	}

	static async __pLoadItemIndex (isBasicIndex) {
		const dataSource = async () => {
			const allItems = await Renderer.item.pBuildList({isBlacklistVariants: true});
			return {
				item: allItems.filter(it => {
					if (it.type === "GV") return false;
					if (isBasicIndex == null) return true;
					const isBasic = it.rarity === "None" || it.rarity === "Unknown" || it._category === "Basic";
					return isBasicIndex ? isBasic : !isBasic;
				})
			};
		};
		const indexName = isBasicIndex == null ? "entity_Items" : isBasicIndex ? "entity_ItemsBasic" : "entity_ItemsMagic";
		return SearchWidget.pLoadCustomIndex(indexName, dataSource, "item", Parser.CAT_ID_ITEM, UrlUtil.PG_ITEMS, "items");
	}

	static async __pGetUserItemSearch (isBasicIndex) {
		const tagBuilder = (encName, encSource) => `{@item ${decodeURIComponent(encName)}${encSource !== UrlUtil.encodeForHash(SRC_DMG) ? `|${decodeURIComponent(encSource)}` : ""}}`;
		const indexName = isBasicIndex == null ? "entity_Items" : isBasicIndex ? "entity_ItemsBasic" : "entity_ItemsMagic";
		return SearchWidget.pGetUserEntitySearch("Select Item", indexName, tagBuilder);
	}

	static async pGetUserBasicItemSearch () {
		await SearchWidget.__pLoadItemIndex(true);
		return SearchWidget.__pGetUserItemSearch(true);
	}

	static async pGetUserMagicItemSearch () {
		await SearchWidget.__pLoadItemIndex(false);
		return SearchWidget.__pGetUserItemSearch(false);
	}

	static async pGetUserItemSearch () {
		await SearchWidget.__pLoadItemIndex();
		return SearchWidget.__pGetUserItemSearch();
	}
	// endregion

	static async pGetUserEntitySearch (title, indexName, tagBuilder, opts) {
		opts = opts || {};

		return new Promise(resolve => {
			const searchOpts = {defaultCategory: indexName};
			if (opts.resultFilter) searchOpts.resultFilter = opts.resultFilter;

			const searchWidget = new SearchWidget(
				{[indexName]: SearchWidget.CONTENT_INDICES[indexName]},
				(page, source, hash) => {
					const [encName] = hash.split(HASH_LIST_SEP);
					const name = decodeURIComponent(encName);
					doClose(false); // "cancel" close
					resolve({
						page,
						source,
						hash,
						name,
						tag: tagBuilder(name, source)
					});
				},
				searchOpts
			);
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title,
				cbClose: (doResolve) => {
					searchWidget.$wrpSearch.detach();
					if (doResolve) resolve(null); // ensure resolution
				}
			});
			$modalInner.append(searchWidget.$wrpSearch);
			searchWidget.doFocus();
		});
	}

	// region custom search indexes
	static async pLoadCustomIndex (contentIndexName, dataSource, jsonProp, catId, page, errorName) {
		if (SearchWidget.P_LOADING_INDICES[contentIndexName]) await SearchWidget.P_LOADING_INDICES[contentIndexName];
		else {
			const doClose = SearchWidget._showLoadingModal();

			try {
				SearchWidget.P_LOADING_INDICES[contentIndexName] = (SearchWidget.CONTENT_INDICES[contentIndexName] = await SearchWidget._pGetIndex(dataSource, jsonProp, catId, page));
				SearchWidget.P_LOADING_INDICES[contentIndexName] = null;
			} catch (e) {
				JqueryUtil.doToast({type: "danger", content: `Could not load ${errorName}! ${MiscUtil.STR_SEE_CONSOLE}`});
				throw e;
			} finally {
				doClose();
			}
		}
	}

	static async _pGetIndex (dataSource, prop, catId, page) {
		const index = elasticlunr(function () {
			this.addField("n");
			this.addField("s");
			this.setRef("id");
		});

		const [featJson, homebrew] = await Promise.all([
			typeof dataSource === "string" ? DataUtil.loadJSON(dataSource) : dataSource(),
			BrewUtil.pAddBrewData()
		]);

		featJson[prop].concat(homebrew[prop] || []).forEach((it, i) => index.addDoc({
			id: i,
			c: catId,
			cf: Parser.pageCategoryToFull(catId),
			h: 1,
			n: it.name,
			p: it.page,
			s: it.source,
			u: UrlUtil.URL_TO_HASH_BUILDER[page](it)
		}));

		return index;
	}

	static _showLoadingModal () {
		const {$modalInner, doClose} = UiUtil.getShowModal({isPermanent: true});
		$(`<div class="flex-vh-center w-100 h-100"><span class="dnd-font italic text-muted">Loading...</span></div>`).appendTo($modalInner);
		return doClose;
	}
	// endregion
}
SearchWidget.P_LOADING_CONTENT = null;
SearchWidget.CONTENT_INDICES = {};
SearchWidget.P_LOADING_INDICES = {};

class InputUiUtil {
	/**
	 * @param opts Options.
	 * @param opts.min Minimum value.
	 * @param opts.max Maximum value.
	 * @param opts.int If the value returned should be an integer.
	 * @param opts.title Prompt title.
	 * @param opts.default Default value.
	 * @param [opts.$elePre] Element to add before the number input.
	 * @param [opts.$elePost] Element to add after the number input.
	 * @param [opts.isPermanent] If the prompt can only be closed by entering a number.
	 * @return {Promise<number>} A promise which resolves to the number if the user entered one, or null otherwise.
	 */
	static pGetUserNumber (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $iptNumber = $(`<input class="form-control mb-2 text-right" ${opts.min ? `min="${opts.min}"` : ""} ${opts.max ? `max="${opts.max}"` : ""} ${opts.default != null ? `value="${opts.default}"` : ""}>`)
				.keydown(evt => {
					// return key
					if (evt.which === 13) doClose(true);
					evt.stopPropagation();
				});
			const $btnOk = $(`<button class="btn btn-default">Enter</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Enter a Number",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					const raw = $iptNumber.val();
					if (!raw.trim()) return resolve(null);
					let num = UiUtil.strToInt(raw);
					if (opts.min) num = Math.max(opts.min, num);
					if (opts.max) num = Math.min(opts.max, num);
					if (opts.int) return resolve(Math.round(num));
					else resolve(num);
				}
			});

			if (opts.$elePre) opts.$elePre.appendTo($modalInner);
			$iptNumber.appendTo($modalInner);
			if (opts.$elePost) opts.$elePost.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
			$iptNumber.focus();
			$iptNumber.select();
		});
	}

	/**
	 * @param [opts] Options.
	 * @param [opts.title] Prompt title.
	 * @param [opts.textYes] Text for "yes" button.
	 * @param [opts.textNo] Text for "no" button.
	 * @return {Promise} A promise which resolves to true/false if the user chose, or null otherwise.
	 */
	static pGetUserBoolean (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $btnTrue = $(`<button class="btn btn-primary flex-v-center mr-2"><span class="glyphicon glyphicon-ok mr-2"/><span>${opts.textYes || "Yes"}</span></button>`)
				.click(() => doClose(true, true));

			const $btnFalse = $(`<button class="btn btn-default flex-v-center"><span class="glyphicon glyphicon-remove mr-2"/><span>${opts.textNo || "No"}</span></button>`)
				.click(() => doClose(true, false));

			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Choose",
				noMinHeight: true,
				cbClose: (isDataEntered, value) => {
					if (!isDataEntered) return resolve(null);
					if (value == null) throw new Error(`Callback must receive a value!`); // sanity check
					resolve(value);
				}
			});

			$$`<div class="flex-vh-center py-1">${$btnTrue}${$btnFalse}</div>`.appendTo($modalInner);
			$btnTrue.focus();
			$btnTrue.select();
		});
	}

	/**
	 * @param opts Options.
	 * @param opts.values Array of values.
	 * @param [opts.placeholder] Placeholder text.
	 * @param [opts.title] Prompt title.
	 * @param [opts.default] Default selected index.
	 * @param [opts.fnDisplay] Function which takes a value and returns display text.
	 * @param [opts.isResolveItem] True if the promise should resolve the item instead of the index.
	 * @param [opts.$elePost] Element to add below the select box.
	 * @param [opts.fnGetExtraState] Function which returns additional state from, generally, other elements in the modal.
	 * @return {Promise} A promise which resolves to the index of the item the user selected (or an object if fnGetExtraState is passed), or null otherwise.
	 */
	static pGetUserEnum (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $selEnum = $(`<select class="form-control mb-2"><option value="-1" disabled>${opts.placeholder || "Select..."}</option></select>`);

			opts.values.forEach((v, i) => $(`<option value="${i}"/>`).text(opts.fnDisplay ? opts.fnDisplay(v, i) : v).appendTo($selEnum));
			if (opts.default != null) $selEnum.val(opts.default);
			else $selEnum[0].selectedIndex = 0;

			const $btnOk = $(`<button class="btn btn-default">Confirm</button>`)
				.click(() => doClose(true));

			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Select an Option",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					const ix = Number($selEnum.val());
					if (!~ix) return resolve(null);
					if (opts.fnGetExtraState) {
						const out = {extraState: opts.fnGetExtraState()};
						if (opts.isResolveItem) out.item = opts.values[ix];
						else out.ix = ix;
						resolve(out)
					} else resolve(opts.isResolveItem ? opts.values[ix] : ix);
				}
			});
			$selEnum.appendTo($modalInner);
			if (opts.$elePost) opts.$elePost.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
			$selEnum.focus();
		});
	}

	/**
	 * @param opts Options.
	 * @param opts.values Array of values.
	 * @param [opts.title] Prompt title.
	 * @param [opts.count] Number of choices the user can make (cannot be used with min/max).
	 * @param [opts.min] Minimum number of choices the user can make (cannot be used with count).
	 * @param [opts.max] Maximum number of choices the user can make (cannot be used with count).
	 * @param [opts.defaults] Default selected indices.
	 * @param [opts.isResolveItems] True if the promise should resolve to an array of the items instead of the indices.
	 * @param [opts.fnDisplay] Function which takes a value and returns display text.
	 * @return {Promise} A promise which resolves to the indices of the items the user selected, or null otherwise.
	 */
	static pGetUserMultipleChoice (opts) {
		opts = opts || {};

		if (opts.count != null && (opts.min != null || opts.max != null)) throw new Error(`Chooser must be either in "count" mode or "min/max" mode!`);
		// If no mode is specified, default to a "count 1" chooser
		if (opts.count == null && opts.min == null && opts.max == null) opts.count = 1;

		class ChoiceRow extends BaseComponent {
			_getDefaultState () { return {isActive: false}; }
		}

		return new Promise(resolve => {
			const $btnOk = $(`<button class="btn btn-default">Confirm</button>`)
				.click(() => doClose(true));

			const rowMetas = [];
			opts.values.forEach((v, i) => {
				const comp = new ChoiceRow();
				if (opts.defaults) comp._state.isActive = opts.defaults.includes(i);

				const $cb = ComponentUiUtil.$getCbBool(comp, "isActive");
				const hookDisable = () => {
					const activeRows = rowMetas.filter(it => it.comp._state.isActive);

					let isAcceptable = false;
					if (opts.count != null) {
						if (activeRows.length >= opts.count) isAcceptable = true;
					} else {
						if (activeRows.length >= (opts.min || 0) && activeRows.length <= (opts.max || Number.MAX_SAFE_INTEGER)) isAcceptable = true;
					}

					if (isAcceptable) {
						if (opts.count != null || (opts.max != null && activeRows.length === opts.max)) {
							rowMetas.forEach(it => it.$cb.attr("disabled", !it.comp._state.isActive));
						} else {
							rowMetas.forEach(it => it.$cb.attr("disabled", false));
						}
						$btnOk.attr("disabled", false);
					} else {
						rowMetas.forEach(it => it.$cb.attr("disabled", false));
						$btnOk.attr("disabled", true);
					}
				};
				comp._addHookBase("isActive", hookDisable);
				hookDisable();

				rowMetas.push({
					$cb,
					$ele: $$`<label class="flex-v-center row my-1">
						<div class="col-2 flex-vh-center">${$cb}</div>
						<div class="col-10">${opts.fnDisplay ? opts.fnDisplay(v, i) : v}</div>
					</label>`,
					comp
				});
			});

			const $wrpList = $$`<div class="flex-col w-100 striped-even mb-1 overflow-y-auto">${rowMetas.map(it => it.$ele)}</div>`;

			let title = opts.title;
			if (!title) {
				if (opts.count != null) title = `Choose ${Parser.numberToText(opts.count).uppercaseFirst()}`;
				else if (opts.min != null && opts.max != null) title = `Choose Between ${Parser.numberToText(opts.min).uppercaseFirst()} and ${Parser.numberToText(opts.max).uppercaseFirst()} Options`;
				else if (opts.min != null) title = `Choose At Least ${Parser.numberToText(opts.min).uppercaseFirst()}`;
				else title = `Choose At Most ${Parser.numberToText(opts.max).uppercaseFirst()}`;
			}

			const {$modalInner, doClose} = UiUtil.getShowModal({
				title,
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);

					const ixs = rowMetas.map((row, ix) => row.comp._state.isActive ? ix : null).filter(it => it != null);
					resolve(opts.isResolveItems ? ixs.map(ix => opts.values[ix]) : ixs);
				}
			});
			$wrpList.appendTo($modalInner);
			$$`<div class="flex-vh-center no-shrink">${$btnOk}</div>`.appendTo($modalInner);
			$wrpList.focus();
		});
	}

	/**
	 * NOTE: designed to work with FontAwesome.
	 *
	 * @param opts Options.
	 * @param opts.values Array of icon metadata. Items should be of the form: `{name: "<n>", iconClass: "<c>", buttonClass: "<cs>", buttonClassActive: "<cs>"}`
	 * @param opts.title Prompt title.
	 * @param opts.default Default selected index.
	 * @return {Promise<number>} A promise which resolves to the index of the item the user selected, or null otherwise.
	 */
	static pGetUserIcon (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			let lastIx = opts.default != null ? opts.default : -1;
			const onclicks = [];

			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Select an Option",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					return resolve(~lastIx ? lastIx : null);
				}
			});

			$$`<div class="flex flex-wrap flex-h-center mb-2">${opts.values.map((v, i) => {
				const $btn = $$`<div class="m-2 btn ${v.buttonClass || "btn-default"} ui__btn-xxl-square flex-col flex-h-center">
					${v.iconClass ? `<div class="ui-icn__wrp-icon ${v.iconClass} mb-1"></div>` : ""}
					${v.iconContent ? v.iconContent : ""}
					<div class="whitespace-normal w-100">${v.name}</div>
				</div>`
					.click(() => {
						lastIx = i;
						onclicks.forEach(it => it());
					})
					.toggleClass(v.buttonClassActive || "active", opts.default === i);
				if (v.buttonClassActive && opts.default === i) {
					$btn.removeClass("btn-default").addClass(v.buttonClassActive);
				}

				onclicks.push(() => {
					$btn.toggleClass(v.buttonClassActive || "active", lastIx === i);
					if (v.buttonClassActive) $btn.toggleClass("btn-default", lastIx !== i);
				});
				return $btn;
			})}</div>`.appendTo($modalInner);

			const $btnOk = $(`<button class="btn btn-default">Confirm</button>`)
				.click(() => doClose(true));

			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
		});
	}

	/**
	 * @param [opts] Options.
	 * @param [opts.title] Prompt title.
	 * @param [opts.default] Default value.
	 * @param [opts.autocomplete] Array of autocomplete strings. REQUIRES INCLUSION OF THE TYPEAHEAD LIBRARY.
	 * @param [opts.isCode] If the text is code.
	 * @return {Promise<String>} A promise which resolves to the string if the user entered one, or null otherwise.
	 */
	static pGetUserString (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $iptStr = $(`<input class="form-control mb-2">`)
				.val(opts.default)
				.keydown(async evt => {
					if (opts.autocomplete) {
						// prevent double-binding the return key if we have autocomplete enabled
						await MiscUtil.pDelay(17); // arbitrary delay to allow dropdown to render (~1000/60, i.e. 1 60 FPS frame)
						if ($modalInner.find(`.typeahead.dropdown-menu`).is(":visible")) return;
					}
					// return key
					if (evt.which === 13) doClose(true);
					evt.stopPropagation();
				});
			if (opts.isCode) $iptStr.addClass("code");
			if (opts.autocomplete && opts.autocomplete.length) $iptStr.typeahead({source: opts.autocomplete});
			const $btnOk = $(`<button class="btn btn-default">Enter</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Enter Text",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					const raw = $iptStr.val();
					if (!raw.trim()) return resolve(null);
					else return resolve(raw);
				}
			});
			$iptStr.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
			$iptStr.focus();
			$iptStr.select();
		});
	}

	/**
	 * @param [opts] Options.
	 * @param [opts.title] Prompt title.
	 * @param [opts.buttonText] Prompt title.
	 * @param [opts.default] Default value.
	 * @param [opts.disabled] If the text area is disabled.
	 * @param [opts.isCode] If the text is code.
	 * @return {Promise<String>} A promise which resolves to the string if the user entered one, or null otherwise.
	 */
	static pGetUserText (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $iptStr = $(`<textarea class="form-control mb-2 resize-vertical w-100" ${opts.disabled ? "disabled" : ""}/>`)
				.val(opts.default);
			if (opts.isCode) $iptStr.addClass("code");
			const $btnOk = $(`<button class="btn btn-default">${opts.buttonText || "Enter"}</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Enter Text",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					const raw = $iptStr.val();
					if (!raw.trim()) return resolve(null);
					else return resolve(raw);
				}
			});
			$iptStr.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
			$iptStr.focus();
			$iptStr.select();
		});
	}

	/**
	 * @param opts Options.
	 * @param opts.title Prompt title.
	 * @param opts.default Default value.
	 * @return {Promise<String>} A promise which resolves to the color if the user entered one, or null otherwise.
	 */
	static pGetUserColor (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const $iptRgb = $(`<input class="form-control mb-2" ${opts.default != null ? `value="${opts.default}"` : ""} type="color">`);
			const $btnOk = $(`<button class="btn btn-default">Confirm</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Choose Color",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					const raw = $iptRgb.val();
					if (!raw.trim()) return resolve(null);
					else return resolve(raw);
				}
			});
			$iptRgb.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
			$iptRgb.focus();
			$iptRgb.select();
		});
	}

	/**
	 *
	 * @param [opts] Options object.
	 * @param [opts.title] Modal title.
	 * @param [opts.default] Default angle.
	 * @param [opts.stepButtons] Array of labels for quick-set buttons, which will be evenly spread around the clock.
	 * @param [opts.step] Number of steps in the gauge (default 360; would be e.g. 12 for a "clock").
	 * @returns {Promise<number>} A promise which resolves to the number of degrees if the user pressed "Enter," or null otherwise.
	 */
	static pGetUserDirection (opts) {
		const X = 0;
		const Y = 1;
		const DEG_CIRCLE = 360;

		opts = opts || {};
		const step = Math.max(2, Math.min(DEG_CIRCLE, opts.step || DEG_CIRCLE));
		const stepDeg = DEG_CIRCLE / step;

		function getAngle (p1, p2) {
			return Math.atan2(p2[Y] - p1[Y], p2[X] - p1[X]) * 180 / Math.PI;
		}

		return new Promise(resolve => {
			let active = false;
			let curAngle = Math.min(DEG_CIRCLE, opts.default) || 0;

			const $arm = $(`<div class="ui-dir__arm"/>`);
			const handleAngle = () => $arm.css({transform: `rotate(${curAngle + 180}deg)`});
			handleAngle();

			const $pad = $$`<div class="ui-dir__face">${$arm}</div>`.on("mousedown touchstart", evt => {
				active = true;
				handleEvent(evt);
			});

			const $document = $(document);
			const evtId = `ui_user_dir_${CryptUtil.uid()}`;
			$document.on(`mousemove.${evtId} touchmove${evtId}`, evt => {
				handleEvent(evt);
			}).on(`mouseup.${evtId} touchend${evtId} touchcancel${evtId}`, evt => {
				evt.preventDefault();
				evt.stopPropagation();
				active = false;
			});
			const handleEvent = (evt) => {
				if (!active) return;

				const coords = [EventUtil.getClientX(evt), EventUtil.getClientY(evt)];

				const {top, left} = $pad.offset();
				const center = [left + ($pad.width() / 2), top + ($pad.height() / 2)];
				curAngle = getAngle(center, coords) + 90;
				if (step !== DEG_CIRCLE) curAngle = Math.round(curAngle / stepDeg) * stepDeg;
				else curAngle = Math.round(curAngle);
				handleAngle();
			};

			const BTN_STEP_SIZE = 26;
			const BORDER_PAD = 16;
			const CONTROLS_RADIUS = (92 + BTN_STEP_SIZE + BORDER_PAD) / 2;
			const $padOuter = opts.stepButtons ? (() => {
				const steps = opts.stepButtons;
				const SEG_ANGLE = 360 / steps.length;

				const $btns = [];

				for (let i = 0; i < steps.length; ++i) {
					const theta = (SEG_ANGLE * i * (Math.PI / 180)) - (1.5708); // offset by -90 degrees
					const x = CONTROLS_RADIUS * Math.cos(theta);
					const y = CONTROLS_RADIUS * Math.sin(theta);
					$btns.push(
						$(`<button class="btn btn-default btn-xxs absolute">${steps[i]}</button>`)
							.css({
								top: y + CONTROLS_RADIUS - (BTN_STEP_SIZE / 2),
								left: x + CONTROLS_RADIUS - (BTN_STEP_SIZE / 2),
								width: BTN_STEP_SIZE,
								height: BTN_STEP_SIZE,
								zIndex: 1002
							})
							.click(() => {
								curAngle = SEG_ANGLE * i;
								handleAngle();
							})
					);
				}

				const $wrpInner = $$`<div class="flex-vh-center relative">${$btns}${$pad}</div>`
					.css({
						width: CONTROLS_RADIUS * 2,
						height: CONTROLS_RADIUS * 2
					});

				return $$`<div class="flex-vh-center">${$wrpInner}</div>`
					.css({
						width: (CONTROLS_RADIUS * 2) + BTN_STEP_SIZE + BORDER_PAD,
						height: (CONTROLS_RADIUS * 2) + BTN_STEP_SIZE + BORDER_PAD
					})
			})() : null;

			const $btnOk = $(`<button class="btn btn-default">Confirm</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Select Direction",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					$document.off(`mousemove.${evtId} touchmove${evtId} mouseup.${evtId} touchend${evtId} touchcancel${evtId}`);
					if (!isDataEntered) return resolve(null);
					if (curAngle < 0) curAngle += 360;
					return resolve(curAngle); // TODO returning the step number is more useful if step is specified?
				}
			});
			$$`<div class="flex-vh-center mb-3">
				${$padOuter || $pad}
			</div>`.appendTo($modalInner);
			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
		});
	}

	/**
	 * @param [opts] Options.
	 * @param [opts.title] Prompt title.
	 * @param [opts.default] Default values. Should be an object of the form `{num, faces, bonus}`.
	 * @return {Promise<String>} A promise which resolves to a dice string if the user entered values, or null otherwise.
	 */
	static pGetUserDice (opts) {
		opts = opts || {};
		return new Promise(resolve => {
			const comp = BaseComponent.fromObject({
				num: (opts.default && opts.default.num) || 1,
				faces: (opts.default && opts.default.faces) || 6,
				bonus: (opts.default && opts.default.bonus) || null
			});

			comp.render = function ($parent) {
				$parent.empty();

				const $iptNum = ComponentUiUtil.$getIptInt(this, "num", 0, {$ele: $(`<input class="form-control input-xs form-control--minimal text-center mr-1">`)})
					.appendTo($parent)
					.keydown(evt => {
						// return key
						if (evt.which === 13) doClose(true);
						evt.stopPropagation();
					});
				const $selFaces = ComponentUiUtil.$getSelEnum(this, "faces", {values: Renderer.dice.DICE})
					.addClass("mr-2").addClass("text-center").css("textAlignLast", "center");

				const $iptBonus = $(`<input class="form-control input-xs form-control--minimal text-center">`)
					.change(() => this._state.bonus = UiUtil.strToInt($iptBonus.val(), null, {fallbackOnNaN: null}))
					.keydown(evt => {
						// return key
						if (evt.which === 13) doClose(true);
						evt.stopPropagation();
					});
				const hook = () => $iptBonus.val(this._state.bonus != null ? UiUtil.intToBonus(this._state.bonus) : this._state.bonus);
				comp._addHookBase("bonus", hook);
				hook();

				$$`<div class="flex-vh-center">${$iptNum}<div class="mr-1">d</div>${$selFaces}${$iptBonus}</div>`.appendTo($parent);
			};

			comp.getAsString = function () {
				return `${this._state.num}d${this._state.faces}${this._state.bonus ? UiUtil.intToBonus(this._state.bonus) : ""}`;
			};

			const $btnOk = $(`<button class="btn btn-default">Enter</button>`)
				.click(() => doClose(true));
			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: opts.title || "Enter Dice",
				noMinHeight: true,
				cbClose: (isDataEntered) => {
					if (!isDataEntered) return resolve(null);
					return resolve(comp.getAsString());
				}
			});

			comp.render($modalInner);

			$$`<div class="flex-vh-center">${$btnOk}</div>`.appendTo($modalInner);
		});
	}
}

class DragReorderUiUtil {
	/**
	 * Create a draggable pad capable of re-ordering rendered components. This requires to components to have:
	 *  - an `id` getter
	 *  - a `pos` getter and setter
	 *  - a `height` getter
	 *
	 * @param opts Options object.
	 * @param opts.$parent The parent element containing the rendered components.
	 * @param opts.componentsParent The object which has the array of components as a property.
	 * @param opts.componentsProp The property name of the components array.
	 * @param opts.componentId This component ID.
	 * @param [opts.marginSide] The margin side; "r" or "l" (defaults to "l").
	 */
	static $getDragPad (opts) {
		opts = opts || {};

		const getComponentById = (id) => opts.componentsParent[opts.componentsProp].find(it => it.id === id);

		const dragMeta = {};
		const doDragCleanup = () => {
			dragMeta.on = false;
			dragMeta.$wrap.remove();
			dragMeta.$dummies.forEach($d => $d.remove());
		};

		const doDragRender = () => {
			if (dragMeta.on) doDragCleanup();

			dragMeta.on = true;
			dragMeta.$wrap = $(`<div class="flex-col ui-drag__wrp-drag-block"/>`).appendTo(opts.$parent);
			dragMeta.$dummies = [];

			const ids = opts.componentsParent[opts.componentsProp].map(it => it.id);

			ids.forEach(id => {
				const $dummy = $(`<div class="w-100 ${id === opts.componentId ? "ui-drag__wrp-drag-dummy--highlight" : "ui-drag__wrp-drag-dummy--lowlight"}"/>`)
					.height(getComponentById(id).height)
					.mouseup(() => {
						if (dragMeta.on) doDragCleanup();
					})
					.appendTo(dragMeta.$wrap);
				dragMeta.$dummies.push($dummy);

				if (id !== opts.componentId) { // on entering other areas, swap positions
					$dummy.mouseenter(() => {
						const cachedPos = getComponentById(id).pos;

						getComponentById(id).pos = getComponentById(opts.componentId).pos;
						getComponentById(opts.componentId).pos = cachedPos;

						doDragRender();
					});
				}
			});
		};

		return $(`<div class="m${opts.marginSide || "l"}-2 ui-drag__patch" title="Drag to Reorder">
		<div class="ui-drag__patch-col"><div>&#8729</div><div>&#8729</div><div>&#8729</div></div>
		<div class="ui-drag__patch-col"><div>&#8729</div><div>&#8729</div><div>&#8729</div></div>
		</div>`).mousedown(() => doDragRender());
	}

	/**
	 * @param $fnGetRow Function which returns a $row element. Is a function instead of a value so it can be lazy-loaded later.
	 * @param opts Options object.
	 * @param opts.$parent
	 * @param opts.swapRowPositions
	 * @param [opts.$children] An array of row elements.
	 * @param [opts.$getChildren] Should return an array as described in the "$children" option.
	 */
	static $getDragPadOpts ($fnGetRow, opts) {
		if (!opts.$parent || !opts.swapRowPositions || (!opts.$children && !opts.$getChildren)) throw new Error("Missing required option(s)!");

		const dragMeta = {};
		const doDragCleanup = () => {
			dragMeta.on = false;
			dragMeta.$wrap.remove();
			dragMeta.$dummies.forEach($d => $d.remove());
		};

		const doDragRender = () => {
			if (dragMeta.on) doDragCleanup();

			dragMeta.on = true;
			dragMeta.$wrap = $(`<div class="flex-col ui-drag__wrp-drag-block"/>`).appendTo(opts.$parent);
			dragMeta.$dummies = [];

			const $children = opts.$getChildren ? opts.$getChildren() : opts.$children;
			const ixRow = $children.indexOf($fnGetRow());

			$children.forEach(($child, i) => {
				const dimensions = {w: $child.outerWidth(true), h: $child.outerHeight(true)};
				const $dummy = $(`<div class="${i === ixRow ? "ui-drag__wrp-drag-dummy--highlight" : "ui-drag__wrp-drag-dummy--lowlight"}"/>`)
					.width(dimensions.w).height(dimensions.h)
					.mouseup(() => {
						if (dragMeta.on) doDragCleanup();
					})
					.appendTo(dragMeta.$wrap);
				dragMeta.$dummies.push($dummy);

				if (i !== ixRow) { // on entering other areas, swap positions
					$dummy.mouseenter(() => {
						opts.swapRowPositions(i, ixRow);
						doDragRender();
					});
				}
			});
		};

		return $(`<div class="mr-2 ui-drag__patch" title="Drag to Reorder">
		<div class="ui-drag__patch-col"><div>&#8729</div><div>&#8729</div><div>&#8729</div></div>
		<div class="ui-drag__patch-col"><div>&#8729</div><div>&#8729</div><div>&#8729</div></div>
		</div>`).mousedown(() => doDragRender());
	}

	/**
	 * @param $fnGetRow Function which returns a $row element. Is a function instead of a value so it can be lazy-loaded later.
	 * @param $parent Parent elements to attach row elements to. Should have (e.g.) "relative" CSS positioning.
	 * @param parent Parent component which has a pod decomposable as {swapRowPositions, <childComponents|getChildComponents>}.
	 * @return jQuery
	 */
	static $getDragPad2 ($fnGetRow, $parent, parent) {
		const {swapRowPositions, $children, $getChildren} = parent;
		const nxtOpts = {$parent, swapRowPositions, $children, $getChildren};
		return this.$getDragPadOpts($fnGetRow, nxtOpts)
	}
}

class SourceUiUtil {
	static _getValidOptions (options) {
		if (!options) throw new Error(`No options were specified!`);
		if (!options.$parent || !options.cbConfirm || !options.cbConfirmExisting || !options.cbCancel) throw new Error(`Missing options!`);
		options.mode = options.mode || "add";
		return options;
	}

	/**
	 * @param options Options object.
	 * @param options.$parent Parent element.
	 * @param options.cbConfirm Confirmation callback for inputting new sources.
	 * @param options.cbConfirmExisting Confirmation callback for selecting existing sources.
	 * @param options.cbCancel Cancellation callback.
	 * @param options.mode (Optional) Mode to build in, "select", "edit" or "add". Defaults to "select".
	 * @param options.source (Optional) Homebrew source object.
	 * @param options.isRequired (Optional) True if a source must be selected.
	 */
	static render (options) {
		options = SourceUiUtil._getValidOptions(options);
		options.$parent.empty();
		options.mode = options.mode || "select";

		const isEditMode = options.mode === "edit";

		let jsonDirty = false;
		const $iptName = $(`<input class="form-control ui-source__ipt-named">`)
			.change(() => {
				if (!jsonDirty && !isEditMode) $iptJson.val($iptName.val().replace(/[^-_a-zA-Z]/g, ""));
				$iptName.removeClass("form-control--error");
			});
		if (options.source) $iptName.val(options.source.full);
		const $iptAbv = $(`<input class="form-control ui-source__ipt-named">`)
			.change(() => {
				$iptAbv.removeClass("form-control--error");
			});
		if (options.source) $iptAbv.val(options.source.abbreviation);
		const $iptJson = $(`<input class="form-control ui-source__ipt-named" ${isEditMode ? "disabled" : ""}>`)
			.change(() => {
				jsonDirty = true;
				$iptJson.removeClass("form-control--error");
			});
		if (options.source) $iptJson.val(options.source.json);
		const $iptUrl = $(`<input class="form-control ui-source__ipt-named">`);
		if (options.source) $iptUrl.val(options.source.url);
		const $iptAuthors = $(`<input class="form-control ui-source__ipt-named">`);
		if (options.source) $iptAuthors.val((options.source.authors || []).join(", "));
		const $iptConverters = $(`<input class="form-control ui-source__ipt-named">`);
		if (options.source) $iptConverters.val((options.source.convertedBy || []).join(", "));

		const $btnConfirm = $(`<button class="btn btn-default">Confirm</button>`)
			.click(() => {
				let incomplete = false;
				[$iptName, $iptAbv, $iptJson].forEach($ipt => {
					const val = $ipt.val();
					if (!val || !val.trim()) (incomplete = true) && $ipt.addClass("form-control--error");
				});
				if (incomplete) return;

				const jsonVal = $iptJson.val().trim();
				if (!isEditMode && BrewUtil.hasSourceJson(jsonVal)) {
					$iptJson.addClass("form-control--error");
					JqueryUtil.doToast({content: `The JSON identifier "${jsonVal}" already exists!`, type: "danger"});
					return;
				}

				const source = {
					json: jsonVal,
					abbreviation: $iptAbv.val().trim(),
					full: $iptName.val().trim(),
					url: $iptUrl.val().trim(),
					authors: $iptAuthors.val().trim().split(",").map(it => it.trim()).filter(Boolean),
					convertedBy: $iptConverters.val().trim().split(",").map(it => it.trim()).filter(Boolean)
				};

				options.cbConfirm(source, options.mode !== "edit");
			});

		const $btnCancel = options.isRequired && !isEditMode
			? null
			: $(`<button class="btn btn-default mr-2">Cancel</button>`).click(() => options.cbCancel());

		const $btnUseExisting = $(`<button class="btn btn-default">Use an Existing Source</button>`)
			.click(() => {
				$stageInitial.hide();
				$stageExisting.show();

				// cleanup
				[$iptName, $iptAbv, $iptJson].forEach($ipt => $ipt.removeClass("form-control--error"));
			});

		const $stageInitial = $$`<div class="h-100 w-100 flex-vh-center"><div>
			<h3 class="text-center">${isEditMode ? "Edit Homebrew Source" : "Add a Homebrew Source"}</h3>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="The name or title for the homebrew you wish to create. This could be the name of a book or PDF; for example, 'Monster Manual'">Title</span>
				${$iptName}
			</div></div>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="An abbreviated form of the title. This will be shown in lists on the site, and in the top-right corner of statblocks or data entries; for example, 'MM'">Abbreviation</span>
				${$iptAbv}
			</div></div>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="This will be used to identify your homebrew universally, so should be unique to you and you alone">JSON Identifier</span>
				${$iptJson}
			</div></div>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="A link to the original homebrew, e.g. a GM Binder page">Source URL</span>
				${$iptUrl}
			</div></div>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="A comma-separated list of authors, e.g. 'John Doe, Joe Bloggs'">Author(s)</span>
				${$iptAuthors}
			</div></div>
			<div class="row ui-source__row mb-2"><div class="col-12 flex-v-center">
				<span class="mr-2 ui-source__name help" title="A comma-separated list of people who converted the homebrew to 5etools' format, e.g. 'John Doe, Joe Bloggs'">Converted By</span>
				${$iptConverters}
			</div></div>
			<div class="text-center mb-2">${$btnCancel}${$btnConfirm}</div>

			${!isEditMode && BrewUtil.homebrewMeta.sources && BrewUtil.homebrewMeta.sources.length ? $$`<div class="flex-vh-center mb-3 mt-3"><span class="ui-source__divider"/>or<span class="ui-source__divider"/></div>
			<div class="flex-vh-center">${$btnUseExisting}</div>` : ""}
		</div></div>`.appendTo(options.$parent);

		const $selExisting = $$`<select class="form-control input-sm">
			<option disabled>Select</option>
			${(BrewUtil.homebrewMeta.sources || []).sort((a, b) => SortUtil.ascSortLower(a.full, b.full)).map(s => `<option value="${s.json.escapeQuotes()}">${s.full.escapeQuotes()}</option>`)}
		</select>`.change(() => $selExisting.removeClass("form-control--error"));
		$selExisting[0].selectedIndex = 0;

		const $btnConfirmExisting = $(`<button class="btn btn-default btn-sm">Confirm</button>`)
			.click(() => {
				if ($selExisting[0].selectedIndex !== 0) {
					const sourceJson = $selExisting.val();
					const source = BrewUtil.sourceJsonToSource(sourceJson);
					options.cbConfirmExisting(source);

					// cleanup
					$selExisting[0].selectedIndex = 0;
					$stageExisting.hide();
					$stageInitial.show();
				} else $selExisting.addClass("form-control--error");
			});

		const $btnBackExisting = $(`<button class="btn btn-default btn-sm mr-2">Back</button>`)
			.click(() => {
				$selExisting[0].selectedIndex = 0;
				$stageExisting.hide();
				$stageInitial.show();
			});

		const $stageExisting = $$`<div class="h-100 w-100 flex-vh-center" style="display: none;"><div>
			<h3 class="text-center">Select a Homebrew Source</h3>
			<div class="row mb-2"><div class="col-12 flex-vh-center">${$selExisting}</div></div>
			<div class="row"><div class="col-12 flex-vh-center">${$btnBackExisting}${$btnConfirmExisting}</div></div>
		</div></div>`.appendTo(options.$parent);
	}
}

class BaseComponent extends ProxyBase {
	constructor () {
		super();

		this.__locks = {};
		this.__rendered = {};

		// state
		this.__state = {...this._getDefaultState()};
		this._state = this._getProxy("state", this.__state);
	}

	_addHookBase (prop, hook) {
		this._addHook("state", prop, hook);
	}

	_removeHookBase (prop, hook) {
		this._removeHook("state", prop, hook);
	}

	_setState (toState) {
		this._proxyAssign("state", "_state", "__state", toState, true);
	}

	_getState () { return MiscUtil.copy(this.__state) }

	getPod () {
		this.__pod = this.__pod || {
			get: (prop) => this._state[prop],
			set: (prop, val) => this._state[prop] = val,
			delete: (prop) => delete this._state[prop],
			addHook: (prop, hook) => this._addHookBase(prop, hook),
			addHookAll: (hook) => this._addHookAll("state", hook),
			removeHook: (prop, hook) => this._removeHookBase(prop, hook),
			triggerCollectionUpdate: (prop) => this._triggerCollectionUpdate(prop),
			setState: (state) => this._setState(state),
			getState: () => this._getState(),
			component: this
		};
		return this.__pod;
	}

	// to be overridden as required
	_getDefaultState () { return {}; }

	getBaseSaveableState () {
		return {
			state: MiscUtil.copy(this.__state)
		};
	}

	setBaseSaveableStateFrom (toLoad) {
		toLoad.state && Object.assign(this._state, toLoad.state);
	}

	/**
	 * Asynchronous version available below.
	 * @param opts Options object.
	 * @param opts.prop The state property.
	 * @param opts.fnUpdateExisting Function to run on existing render meta. Arguments are `rendered, item`.
	 * @param opts.fnGetNew Function to run which generates existing render meta. Arguments are `item`.
	 * @param [opts.isDiffMode] If a diff of the state should be taken/checked before updating renders.
	 * @param [opts.namespace] A namespace to store these renders under. Useful if multiple renders are being made from
	 *        the same collection.
	 */
	_renderCollection (opts) {
		opts = opts || {};

		const renderedLookupProp = opts.namespace ? `${opts.namespace}.${opts.prop}` : opts.prop;
		const rendered = (this.__rendered[renderedLookupProp] = this.__rendered[renderedLookupProp] || {});
		const toDelete = new Set(Object.keys(rendered));

		(this._state[opts.prop] || []).forEach((it, i) => {
			if (it.id == null) throw new Error(`Collection item did not have an ID!`);
			const meta = rendered[it.id];

			toDelete.delete(it.id);
			if (meta) {
				if (opts.isDiffMode) {
					// Hashing the stringified JSON relies on the property order remaining consistent, but this is fine
					const nxtHash = CryptUtil.md5(JSON.stringify(it));
					if (nxtHash !== meta.__hash) {
						meta.__hash = nxtHash;
					} else return;
				}

				meta.data = it; // update any existing pointers
				opts.fnUpdateExisting(meta, it, i);
			} else {
				const meta = opts.fnGetNew(it, i);
				meta.data = it;
				if (!meta.$wrpRow) throw new Error(`A "$wrpRow" property is required in order for deletes!`);

				if (opts.isDiffMode) meta.hash = CryptUtil.md5(JSON.stringify(it));

				rendered[it.id] = meta;
			}
		});

		this._renderCollection_doDeletes(rendered, toDelete);
	}

	/**
	 * Synchronous version available above.
	 * @param [opts] Options object.
	 * @param opts.prop The state property.
	 * @param opts.pFnUpdateExisting Function to run on existing render meta. Arguments are `rendered, item`.
	 * @param opts.pFnGetNew Function to run which generates existing render meta. Arguments are `item`.
	 * @param [opts.isDiffMode] If updates should be run in "diff" mode (i.e. no update is run if nothing has changed).
	 * @param [opts.isMultiRender] If multiple renders will be produced.
	 * @param [opts.additionalCaches] Additional cache objects to be cleared on entity delete. Should be objects with
	 *        entity IDs as keys.
	 * @param [opts.namespace] A namespace to store these renders under. Useful if multiple renders are being made from
	 *        the same collection.
	 */
	async _pRenderCollection (opts) {
		opts = opts || {};

		const renderedLookupProp = opts.namespace ? `${opts.namespace}.${opts.prop}` : opts.prop;
		const rendered = (this.__rendered[renderedLookupProp] = this.__rendered[renderedLookupProp] || {});
		const entities = this._state[opts.prop];
		return this._pRenderCollection_doRender(rendered, entities, opts);
	}

	async _pRenderCollection_doRender (rendered, entities, opts) {
		opts = opts || {};

		const toDelete = new Set(Object.keys(rendered));

		// Run the external functions in serial, to prevent element re-ordering
		for (let i = 0; i < entities.length; ++i) {
			const it = entities[i];

			if (!it.id) throw new Error(`Collection item did not have an ID!`);
			// N.B.: Meta can be an array, if one item maps to multiple renders (e.g. the same is shown in two places)
			const meta = rendered[it.id];

			toDelete.delete(it.id);
			if (meta) {
				if (opts.isDiffMode) {
					// Hashing the stringified JSON relies on the property order remaining consistent, but this is fine
					const nxtHash = CryptUtil.md5(JSON.stringify(it));
					if (nxtHash !== meta.__hash) meta.__hash = nxtHash;
					else continue;
				}

				const nxtMeta = await opts.pFnUpdateExisting(meta, it);
				// Overwrite the existing renders in multi-render mode
				//    Otherwise, just ignore the result--single renders never modify their render
				if (opts.isMultiRender) rendered[it.id] = nxtMeta;
			} else {
				const meta = await opts.pFnGetNew(it);
				// If the generator decides there's nothing to render, skip this item
				if (meta == null) continue;

				if (opts.isMultiRender && meta.some(it => !it.$wrpRow)) throw new Error(`A "$wrpRow" property is required in order for deletes!`);
				if (!opts.isMultiRender && !meta.$wrpRow) throw new Error(`A "$wrpRow" property is required in order for deletes!`);

				if (opts.isDiffMode) meta.__hash = CryptUtil.md5(JSON.stringify(it));

				rendered[it.id] = meta;
			}
		}

		return this._renderCollection_doDeletes(rendered, toDelete, opts);
	}

	_renderCollection_doDeletes (rendered, toDelete, opts) {
		opts = opts || {};

		toDelete.forEach(id => {
			const meta = rendered[id];
			if (opts.isMultiRender) meta.forEach(it => it.$wrpRow.remove());
			else meta.$wrpRow.remove();
			if (opts.additionalCaches) opts.additionalCaches.forEach(it => delete it[id]);
			delete rendered[id];
		});
	}

	/**
	 * Detach (and thus preserve) rendered collection elements so they can be re-used later.
	 * @param prop The state property.
	 * @param [namespace] A namespace to store these renders under. Useful if multiple renders are being made from
	 *        the same collection.
	 */
	_detachCollection (prop, namespace = null) {
		const renderedLookupProp = namespace ? `${namespace}.${prop}` : prop;
		const rendered = (this.__rendered[renderedLookupProp] = this.__rendered[renderedLookupProp] || {});
		Object.values(rendered).forEach(it => it.$wrpRow.detach());
	}

	/**
	 * Wipe any rendered collection elements, and reset the render cache.
	 * @param prop The state property.
	 * @param [namespace] A namespace to store these renders under. Useful if multiple renders are being made from
	 *        the same collection.
	 */
	_resetCollectionRenders (prop, namespace = null) {
		const renderedLookupProp = namespace ? `${namespace}.${prop}` : prop;
		const rendered = (this.__rendered[renderedLookupProp] = this.__rendered[renderedLookupProp] || {});
		Object.values(rendered).forEach(it => it.$wrpRow.remove());
		delete this.__rendered[renderedLookupProp];
	}

	render () { throw new Error("Unimplemented!"); }

	// to be overridden as required
	getSaveableState () { return {...this.getBaseSaveableState()}; }
	setStateFrom (toLoad) { this.setBaseSaveableStateFrom(toLoad); }

	async _pLock (lockName) {
		while (this.__locks[lockName]) await this.__locks[lockName].lock;
		let unlock = null;
		const lock = new Promise(resolve => unlock = resolve);
		this.__locks[lockName] = {
			lock,
			unlock
		}
	}

	_unlock (lockName) {
		const lockMeta = this.__locks[lockName];
		if (lockMeta) {
			delete this.__locks[lockName];
			lockMeta.unlock();
		}
	}

	_triggerCollectionUpdate (prop) {
		if (!this._state[prop]) return;
		this._state[prop] = [...this._state[prop]];
	}

	static _toCollection (array) {
		if (array) return array.map(it => ({id: CryptUtil.uid(), entity: it}));
	}

	static _fromCollection (array) {
		if (array) return array.map(it => it.entity);
	}

	static fromObject (obj, ...noModCollections) {
		const comp = new this();
		Object.entries(MiscUtil.copy(obj)).forEach(([k, v]) => {
			if (v == null) comp.__state[k] = v;
			else if (noModCollections.includes(k)) comp.__state[k] = v;
			else if (typeof v === "object" && v instanceof Array) comp.__state[k] = BaseComponent._toCollection(v);
			else comp.__state[k] = v;
		});
		return comp;
	}

	toObject () {
		const cpy = MiscUtil.copy(this.__state);
		Object.entries(cpy).forEach(([k, v]) => {
			if (v != null && v instanceof Array && v.every(it => it && it.id)) cpy[k] = BaseComponent._fromCollection(v);
		});
		return cpy;
	}
}

class BaseLayeredComponent extends BaseComponent {
	constructor () {
		super();

		// layers
		this._layers = [];
		this.__layerMeta = {};
		this._layerMeta = this._getProxy("layerMeta", this.__layerMeta);
	}

	_addHookDeep (prop, hook) {
		this._addHookBase(prop, hook);
		this._addHook("layerMeta", prop, hook);
	}

	_removeHookDeep (prop, hook) {
		this._removeHookBase(prop, hook);
		this._removeHook("layerMeta", prop, hook);
	}

	_getBase (prop) {
		return this._state[prop];
	}

	_get (prop) {
		if (this._layerMeta[prop]) {
			for (let i = this._layers.length - 1; i >= 0; --i) {
				const val = this._layers[i].data[prop];
				if (val != null) return val;
			}
			// this should never fall through, but if it does, returning the base value is fine
		}
		return this._state[prop];
	}

	_addLayer (layer) {
		this._layers.push(layer);
		this._addLayer_addLayerMeta(layer);
	}

	_addLayer_addLayerMeta (layer) {
		Object.entries(layer.data).forEach(([k, v]) => this._layerMeta[k] = v != null);
	}

	_removeLayer (layer) {
		const ix = this._layers.indexOf(layer);
		if (~ix) {
			this._layers.splice(ix, 1);

			// regenerate layer meta
			Object.keys(this._layerMeta).forEach(k => delete this._layerMeta[k]);
			this._layers.forEach(l => this._addLayer_addLayerMeta(l));
		}
	}

	updateLayersActive (prop) {
		// this uses the fact that updating a proxy value to the same value still triggers hooks
		//   anything listening to changes in this flag will be forced to recalculate from base + all layers
		this._layerMeta[prop] = this._layers.some(l => l.data[prop] != null);
	}

	getBaseSaveableState () {
		return {
			state: MiscUtil.copy(this.__state),
			layers: MiscUtil.copy(this._layers.map(l => l.getSaveableState()))
		};
	}

	setBaseSaveableStateFrom (toLoad) {
		toLoad.state && Object.assign(this._state, toLoad.state);
		if (toLoad.layers) toLoad.layers.forEach(l => this._addLayer(CompLayer.fromSavedState(this, l)));
	}

	getPod () {
		this.__pod = this.__pod || {
			...super.getPod(),

			addHookDeep: (prop, hook) => this._addHookDeep(prop, hook),
			removeHookDeep: (prop, hook) => this._removeHookDeep(prop, hook),
			addHookAll: (hook) => this._addHookAll("state", hook),
			getBase: (prop) => this._getBase(prop),
			get: (prop) => this._get(prop),
			addLayer: (name, data) => {
				// FIXME
				const l = new CompLayer(this, name, data);
				this._addLayer(l);
				return l;
			},
			removeLayer: (layer) => this._removeLayer(layer),
			layers: this._layers // FIXME avoid passing this directly to the child
		};
		return this.__pod;
	}
}

/**
 * A "layer" of state which is applied over the base state.
 *  This allows e.g. a temporary stat reduction to modify a statblock, without actually
 *  modifying the underlying component.
 */
class CompLayer extends ProxyBase {
	constructor (component, layerName, data) {
		super();

		this._name = layerName;
		this.__data = data;

		this.data = this._getProxy("data", this.__data);

		this._addHookAll("data", prop => component.updateLayersActive(prop));
	}

	getSaveableState () {
		return {
			name: this._name,
			data: MiscUtil.copy(this.__data)
		}
	}

	static fromSavedState (component, savedState) { return new CompLayer(component, savedState.name, savedState.data); }
}

const MixinComponentHistory = compClass => class extends compClass {
	constructor () {
		super(...arguments);
		this._histStackUndo = [];
		this._histStackRedo = [];
		this._isHistDisabled = true;
		this._histPropBlacklist = new Set();
		this._histPropWhitelist = null;

		this._histInitialState = null;
	}

	set isHistDisabled (val) { this._isHistDisabled = val; }
	addBlacklistProps (...props) { props.forEach(p => this._histPropBlacklist.add(p)); }
	addWhitelistProps (...props) {
		this._histPropWhitelist = this._histPropWhitelist || new Set();
		props.forEach(p => this._histPropWhitelist.add(p));
	}

	/**
	 * This should be initialised after all other hooks have been added
	 */
	initHistory () {
		// Track the initial state, and watch for further modifications
		this._histInitialState = MiscUtil.copy(this._state);
		this._isHistDisabled = false;

		this._addHookAll("state", prop => {
			if (this._isHistDisabled) return;
			if (this._histPropBlacklist.has(prop)) return;
			if (this._histPropWhitelist && !this._histPropWhitelist.has(prop)) return;

			this.recordHistory();
		});
	}

	recordHistory () {
		const stateCopy = MiscUtil.copy(this._state);

		// remove any un-tracked properties
		this._histPropBlacklist.forEach(prop => delete stateCopy[prop]);
		if (this._histPropWhitelist) Object.keys(stateCopy).filter(k => !this._histPropWhitelist.has(k)).forEach(k => delete stateCopy[k]);

		this._histStackUndo.push(stateCopy);
		this._histStackRedo = [];
	}

	_histAddExcludedProperties (stateCopy) {
		Object.entries(this._state).forEach(([k, v]) => {
			if (this._histPropBlacklist.has(k)) return stateCopy[k] = v;
			if (this._histPropWhitelist && !this._histPropWhitelist.has(k)) stateCopy[k] = v
		});
	}

	undo () {
		if (this._histStackUndo.length) {
			const lastHistDisabled = this._isHistDisabled;
			this._isHistDisabled = true;

			const curState = this._histStackUndo.pop();
			this._histStackRedo.push(curState);
			const toApply = MiscUtil.copy(this._histStackUndo.last() || this._histInitialState);
			this._histAddExcludedProperties(toApply);
			this._setState(toApply);

			this._isHistDisabled = lastHistDisabled;
		} else {
			const lastHistDisabled = this._isHistDisabled;
			this._isHistDisabled = true;

			const toApply = MiscUtil.copy(this._histInitialState);
			this._histAddExcludedProperties(toApply);
			this._setState(toApply);

			this._isHistDisabled = lastHistDisabled;
		}
	}

	redo () {
		if (!this._histStackRedo.length) return;

		const lastHistDisabled = this._isHistDisabled;
		this._isHistDisabled = true;

		const toApplyRaw = this._histStackRedo.pop();
		this._histStackUndo.push(toApplyRaw);
		const toApply = MiscUtil.copy(toApplyRaw);
		this._histAddExcludedProperties(toApply);
		this._setState(toApply);

		this._isHistDisabled = lastHistDisabled;
	}
};

class ComponentUiUtil {
	static trackHook (hooks, prop, hook) {
		hooks[prop] = hooks[prop] || [];
		hooks[prop].push(hook);
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [fallbackEmpty] Fallback number if string is empty.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.html] HTML to convert to element to use.
	 * @param [opts.max] Max allowed return value.
	 * @param [opts.min] Min allowed return value.
	 * @param [opts.offset] Offset to add to value displayed.
	 * @param [opts.padLength] Number of digits to pad the number to.
	 * @param [opts.fallbackOnNaN] Return value if not a number.
	 * @param [opts.isAllowNull] If an empty input should be treated as null.
	 * @param [opts.hookTracker] Object in which to track hook.
	 * @return {JQuery}
	 */
	static $getIptInt (component, prop, fallbackEmpty = 0, opts) {
		return ComponentUiUtil._$getIptNumeric(component, prop, UiUtil.strToInt, fallbackEmpty, opts);
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [fallbackEmpty] Fallback number if string is empty.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.html] HTML to convert to element to use.
	 * @param [opts.max] Max allowed return value.
	 * @param [opts.min] Min allowed return value.
	 * @param [opts.offset] Offset to add to value displayed.
	 * @param [opts.padLength] Number of digits to pad the number to.
	 * @param [opts.fallbackOnNaN] Return value if not a number.
	 * @param [opts.isAllowNull] If an empty input should be treated as null.
	 * @return {JQuery}
	 */
	static $getIptNumber (component, prop, fallbackEmpty = 0, opts) {
		return ComponentUiUtil._$getIptNumeric(component, prop, UiUtil.strToNumber, fallbackEmpty, opts);
	}

	static _$getIptNumeric (component, prop, fnConvert, fallbackEmpty = 0, opts) {
		opts = opts || {};
		opts.offset = opts.offset || 0;

		const $ipt = (opts.$ele || $(opts.html || `<input class="form-control input-xs form-control--minimal text-right">`)).disableSpellcheck()
			.change(() => {
				const raw = $ipt.val().trim();

				if (opts.isAllowNull && !raw) return component._state[prop] = null;

				if (raw.startsWith("=")) {
					// if it starts with "=", force-set to the value provided
					component._state[prop] = fnConvert(raw.slice(1), fallbackEmpty, opts) - opts.offset;
				} else {
					// otherwise, try to modify the previous value
					const mUnary = /^[-+/*^]/.exec(raw);
					if (mUnary) {
						const cur = component._state[prop];
						let proc = raw;
						proc = proc.slice(1).trim();
						const mod = fnConvert(proc, fallbackEmpty, opts);
						const full = `${cur}${mUnary[0]}${mod}`;
						component._state[prop] = fnConvert(full, fallbackEmpty, opts) - opts.offset;
					} else {
						component._state[prop] = fnConvert(raw, fallbackEmpty, opts) - opts.offset;
					}
				}
			});
		const hook = () => {
			if (opts.isAllowNull && component._state[prop] == null) {
				return $ipt.val(null);
			}
			const num = (component._state[prop] || 0) + opts.offset;
			$ipt.val(opts.padLength ? `${num}`.padStart(opts.padLength, "0") : num)
		};
		if (opts.hookTracker) ComponentUiUtil.trackHook(opts.hookTracker, prop, hook);
		component._addHookBase(prop, hook);
		hook();
		return $ipt;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.html] HTML to convert to element to use.
	 * @param [opts.isNoTrim] If the text should not be trimmed.
	 * @param [opts.isAllowNull] If null should be allowed (and preferred) for empty inputs
	 * @param [opts.asMeta] If a meta-object should be returned containing the hook and the checkbox.
	 * @param [opts.autocomplete] Array of autocomplete strings. REQUIRES INCLUSION OF THE TYPEAHEAD LIBRARY.
	 * @param [opts.decorationLeft] Decoration to be added to the left-hand-side of the input. Can be `"search"` or `"clear"`. REQUIRES `asMeta` TO BE SET.
	 * @param [opts.decorationRight] Decoration to be added to the right-hand-side of the input. Can be `"search"` or `"clear"`. REQUIRES `asMeta` TO BE SET.
	 */
	static $getIptStr (component, prop, opts) {
		opts = opts || {};

		// Validate options
		if ((opts.decorationLeft || opts.decorationRight) && !opts.asMeta) throw new Error(`Input must be created with "asMeta" option`);

		const $ipt = (opts.$ele || $(opts.html || `<input class="form-control input-xs form-control--minimal">`)).disableSpellcheck()
			.change(() => {
				const nxtVal = opts.isNoTrim ? $ipt.val() : $ipt.val().trim();
				component._state[prop] = opts.isAllowNull && !nxtVal ? null : nxtVal;
			});

		if (opts.autocomplete && opts.autocomplete.length) $ipt.typeahead({source: opts.autocomplete});
		const hook = () => $ipt.val(component._state[prop]);
		component._addHookBase(prop, hook);
		hook();

		if (opts.asMeta) {
			const out = {$ipt, unhook: () => component._removeHookBase(prop, hook)};

			if (opts.decorationLeft || opts.decorationRight) {
				let $decorLeft;
				let $decorRight;

				if (opts.decorationLeft) {
					$ipt.addClass(`ui__ipt-decorated--left`);
					$decorLeft = ComponentUiUtil._$getDecor($ipt, opts.decorationLeft, "left");
				}

				if (opts.decorationRight) {
					$ipt.addClass(`ui__ipt-decorated--right`);
					$decorRight = ComponentUiUtil._$getDecor($ipt, opts.decorationRight, "right");
				}

				out.$wrp = $$`<div class="relative w-100">${$ipt}${$decorLeft}${$decorRight}</div>`
			}

			return out;
		} else return $ipt;
	}

	static _$getDecor ($ipt, decorType, side) {
		switch (decorType) {
			case "search": {
				return $(`<div class="ui__ipt-decoration ui__ipt-decoration--${side} no-events flex-vh-center"><span class="glyphicon glyphicon-search"/></div>`);
			}
			case "clear": {
				return $(`<div class="ui__ipt-decoration ui__ipt-decoration--${side} flex-vh-center clickable" title="Clear"><span class="glyphicon glyphicon-remove"/></div>`)
					.click(() => $ipt.val("").change().keydown().keyup());
			}
			default: throw new Error(`Unimplemented!`);
		}
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @return {JQuery}
	 */
	static $getIptEntries (component, prop, opts) {
		opts = opts || {};

		const $ipt = (opts.$ele || $(`<textarea class="form-control input-xs form-control--minimal resize-vertical"/>`))
			.change(() => component._state[prop] = UiUtil.getTextAsEntries($ipt.val().trim()));
		const hook = () => $ipt.val(UiUtil.getEntriesAsText(component._state[prop]));
		hook();
		return $ipt;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @return {JQuery}
	 */
	static $getIptColor (component, prop, opts) {
		opts = opts || {};

		const $ipt = (opts.$ele || $(`<input class="form-control input-xs form-control--minimal" type="color">`))
			.change(() => component._state[prop] = $ipt.val());
		const hook = () => $ipt.val(component._state[prop]);
		component._addHookBase(prop, hook);
		hook();
		return $ipt;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.html] HTML to convert to element to use.
	 * @param [opts.text] Button text, if element is not specified.
	 * @param [opts.fnHookPost] Function to run after primary hook.
	 * @param [opts.stateName] State name.
	 * @param [opts.stateProp] State prop.
	 * @param [opts.isInverted] If the toggle display should be inverted.
	 * @param [opts.activeClass] CSS class to use when setting the button as "active."
	 * @return {JQuery}
	 */
	static $getBtnBool (component, prop, opts) {
		opts = opts || {};

		if (opts.html) opts.$ele = $(opts.html);

		const activeClass = opts.activeClass || "active";
		const stateName = opts.stateName || "state";
		const stateProp = opts.stateProp || "_state";

		const $btn = (opts.$ele || $(`<button class="btn btn-xs btn-default">${opts.text || "Toggle"}</button>`))
			.click(() => component[stateProp][prop] = !component[stateProp][prop])
			.contextmenu(evt => {
				evt.preventDefault();
				component[stateProp][prop] = !component[stateProp][prop];
			});
		const hook = () => {
			$btn.toggleClass(activeClass, opts.isInverted ? !component[stateProp][prop] : !!component[stateProp][prop]);
			if (opts.fnHookPost) opts.fnHookPost(component[stateProp][prop]);
		};
		component._addHook(stateName, prop, hook);
		hook();
		return $btn
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param [opts] Options Object.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.asMeta] If a meta-object should be returned containing the hook and the input.
	 * @return {JQuery}
	 */
	static $getCbBool (component, prop, opts) {
		opts = opts || {};

		const $cb = (opts.$ele || $(`<input type="checkbox">`))
			.change(() => component._state[prop] = $cb.prop("checked"));
		const hook = () => $cb.prop("checked", !!component._state[prop]);
		component._addHookBase(prop, hook);
		hook();

		return opts.asMeta ? ({$cb, unhook: () => component._removeHookBase(prop, hook)}) : $cb;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param opts Options Object.
	 * @param opts.values Values to display.
	 * @param [opts.$ele] Element to use.
	 * @param [opts.html] HTML to convert to element to use.
	 * @param [opts.isAllowNull] If null is allowed.
	 * @param [opts.fnDisplay] Value display function.
	 * @param [opts.asMeta] If a meta-object should be returned containing the hook and the select.
	 * @return {JQuery}
	 */
	static $getSelEnum (component, prop, opts) {
		opts = opts || {};

		const $sel = (opts.$ele || $(opts.html || `<select class="form-control input-xs"/>`))
			.change(() => {
				const ix = Number($sel.val());
				if (~ix) component._state[prop] = opts.values[ix];
				else {
					if (opts.isAllowNull) component._state[prop] = null;
					else component._state[prop] = 0;
				}
			});
		if (opts.isAllowNull) $(`<option/>`, {value: -1, text: "\u2014"}).appendTo($sel);
		opts.values.forEach((it, i) => $(`<option/>`, {value: i, text: opts.fnDisplay ? opts.fnDisplay(it) : it}).appendTo($sel));
		const hook = () => {
			const searchFor = component._state[prop] === undefined ? null : component._state[prop];
			// Null handling is done in change handler
			const ix = opts.values.indexOf(searchFor);
			$sel.val(`${ix}`);
		};
		component._addHookBase(prop, hook);
		hook();
		return opts.asMeta ? ({$sel, unhook: () => component._removeHookBase(prop, hook)}) : $sel;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param opts Options Object.
	 * @param opts.values Values to display.
	 * @param [opts.fnDisplay] Value display function.
	 * @return {JQuery}
	 */
	static $getPickEnum (component, prop, opts) {
		opts = opts || {};

		const initialVals = opts.values
			.mergeMap(v => ({[v]: component._state[prop] && component._state[prop].includes(v)}));

		const contextId = ContextUtil.getNextGenericMenuId();
		const contextOptions = opts.values.map(it => new ContextUtil.Action(
			opts.fnDisplay ? opts.fnDisplay(it) : it,
			() => pickComp.getPod().set(it, true)
		));
		ContextUtil.doInitActionContextMenu(contextId, contextOptions);

		const pickComp = BaseComponent.fromObject(initialVals);
		pickComp.render = function ($parent) {
			$parent.empty();

			Object.entries(this._state).forEach(([k, v]) => {
				if (v === false) return;

				const $btnRemove = $(`<button class="btn btn-danger ui-pick__btn-remove">×</button>`)
					.click(() => this._state[k] = false);
				$$`<div class="flex mx-1 mb-1 ui-pick__disp-pill"><div class="px-1 ui-pick__disp-text flex-v-center">${opts.fnDisplay ? opts.fnDisplay(k) : k}</div>${$btnRemove}</div>`.appendTo($parent);
			});
		};

		const $btnAdd = $(`<button class="btn btn-xxs btn-default ui-pick__btn-add mb-1">+</button>`)
			.click(evt => ContextUtil.handleOpenContextMenu(evt, $btnAdd, contextId));

		const $wrpPills = $(`<div class="flex flex-wrap w-100"/>`);
		const $wrp = $$`<div class="flex-v-center">${$btnAdd}${$wrpPills}</div>`;
		pickComp._addHookAll("state", () => {
			component._state[prop] = Object.keys(pickComp._state).filter(k => pickComp._state[k]);
			pickComp.render($wrpPills);
		});
		pickComp.render($wrpPills);
		return $wrp;
	}

	/**
	 * @param component An instance of a class which extends BaseComponent.
	 * @param prop Component to hook on.
	 * @param opts Options Object.
	 * @param opts.values Values to display.
	 * @param [opts.fnDisplay] Value display function.
	 * @param [opts.isDisallowNull] True if null is not an allowed value.
	 * @param [opts.asMeta] If a meta-object should be returned containing the hook and the wrapper.
	 * @param [opts.isIndent] If the checkboxes should be indented.
	 * @return {JQuery}
	 */
	static $getCbsEnum (component, prop, opts) {
		opts = opts || {};

		const $wrp = $(`<div class="flex-col w-100"/>`);
		const metas = opts.values.map(it => {
			const $cb = $(`<input type="checkbox">`)
				.change(() => {
					let didUpdate = false;
					const ix = (component._state[prop] || []).indexOf(it);
					if (~ix) component._state[prop].splice(ix, 1);
					else {
						if (component._state[prop]) component._state[prop].push(it);
						else {
							didUpdate = true;
							component._state[prop] = [it];
						}
					}
					if (!didUpdate) component._state[prop] = [...component._state[prop]];
				});

			$$`<label class="split-v-center my-1 stripe-odd ${opts.isIndent ? "ml-4" : ""}"><div class="no-wrap flex-v-center">${opts.fnDisplay ? opts.fnDisplay(it) : it}</div>${$cb}</label>`.appendTo($wrp);

			return {$cb, value: it};
		});

		const hook = () => metas.forEach(meta => meta.$cb.prop("checked", component._state[prop] && component._state[prop].includes(meta.value)));
		component._addHookBase(prop, hook);
		hook();

		return opts.asMeta ? {$wrp, unhook: () => component._removeHookBase(prop, hook)} : $wrp;
	}
}

if (typeof module !== "undefined") {
	module.exports = {
		ProxyBase,
		UiUtil,
		ProfUiUtil,
		TabUiUtil,
		SearchUiUtil,
		SearchWidget,
		InputUiUtil,
		DragReorderUiUtil,
		SourceUiUtil,
		BaseComponent,
		ComponentUiUtil
	}
}
