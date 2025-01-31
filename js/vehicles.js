"use strict";

class VehiclesPage extends ListPage {
	constructor () {
		const sourceFilter = SourceFilter.getInstance();

		super({
			dataSource: "data/vehicles.json",
			dataSourceFluff: "data/fluff-vehicles.json",

			filters: [
				sourceFilter
			],
			filterSource: sourceFilter,

			listClass: "vehicles",

			sublistClass: "subvehicles",

			dataProps: ["vehicle"]
		});

		this._sourceFilter = sourceFilter;
	}

	getListItem (it, vhI, isExcluded) {
		if (!isExcluded) {
			// populate filters
			this._sourceFilter.addItem(it.source);
		}

		const eleLi = document.createElement("li");
		eleLi.className = `row ${isExcluded ? "row--blacklisted" : ""}`;

		const source = Parser.sourceJsonToAbv(it.source);
		const hash = UrlUtil.autoEncodeHash(it);

		eleLi.innerHTML = `<a href="#${UrlUtil.autoEncodeHash(it)}" class="lst--border">
			<span class="bold col-10 pl-0">${it.name}</span>
			<span class="col-2 text-center ${Parser.sourceJsonToColor(it.source)} pr-0" title="${Parser.sourceJsonToFull(it.source)}" ${BrewUtil.sourceJsonToStyle(it.source)}>${source}</span>
		</a>`;

		const listItem = new ListItem(
			vhI,
			eleLi,
			it.name,
			{
				hash,
				source
			},
			{
				uniqueId: it.uniqueId ? it.uniqueId : vhI,
				isExcluded
			}
		);

		eleLi.addEventListener("click", (evt) => this._list.doSelect(listItem, evt));
		eleLi.addEventListener("contextmenu", (evt) => ListUtil.openContextMenu(evt, this._list, listItem));

		return listItem;
	}

	handleFilterChange () {
		const f = this._filterBox.getValues();
		this._list.filter((item) => {
			const it = this._dataList[item.ix];
			return this._filterBox.toDisplay(
				f,
				it.source
			);
		});
		FilterBox.selectFirstVisible(this._dataList);
	}

	getSublistItem (it, pinId) {
		const hash = UrlUtil.autoEncodeHash(it);

		const $ele = $(`<li class="row"><a href="#${hash}" class="lst--border"><span class="name col-12 px-0">${it.name}</span></a></li>`)
			.contextmenu(evt => ListUtil.openSubContextMenu(evt, listItem));

		const listItem = new ListItem(
			pinId,
			$ele,
			it.name,
			{
				hash
			}
		);
		return listItem;
	}

	doLoadHash (id) {
		Renderer.get().setFirstSection(true);
		const veh = this._dataList[id];
		const $content = $(`#pagecontent`).empty();
		const $floatToken = $(`#float-token`).empty();

		function buildStatsTab () {
			if (veh.tokenUrl || !veh.uniqueId) {
				const imgLink = veh.tokenUrl || UrlUtil.link(`img/vehicles/tokens/${Parser.sourceJsonToAbv(veh.source)}/${veh.name.replace(/"/g, "")}.png`);
				$floatToken.append(`<a href="${imgLink}" target="_blank" rel="noopener noreferrer">
					<img src="${imgLink}" id="token_image" class="token" onerror="TokenUtil.imgError(this)" alt="${veh.name}">
				</a>`);
			} else TokenUtil.imgError();

			$content.append(RenderVehicles.$getRenderedVehicle(veh));
		}

		function buildFluffTab (isImageTab) {
			return Renderer.utils.pBuildFluffTab(
				isImageTab,
				$content,
				veh,
				(fluffJson) => veh.fluff || fluffJson.vehicleFluff.find(it => it.name === veh.name && it.source === veh.source),
				`data/fluff-vehicles.json`,
				() => true
			);
		}

		const statTab = Renderer.utils.tabButton(
			"Item",
			() => $floatToken.show(),
			buildStatsTab
		);
		const infoTab = Renderer.utils.tabButton(
			"Info",
			() => $floatToken.hide(),
			buildFluffTab
		);
		const picTab = Renderer.utils.tabButton(
			"Images",
			() => $floatToken.hide(),
			() => buildFluffTab(true)
		);

		Renderer.utils.bindTabButtons(statTab, infoTab, picTab);

		ListUtil.updateSelected();
	}

	async pDoLoadSubHash (sub) {
		sub = this._filterBox.setFromSubHashes(sub);
		await ListUtil.pSetFromSubHashes(sub);
	}
}

const vehiclesPage = new VehiclesPage();
window.addEventListener("load", () => vehiclesPage.pOnLoad());
