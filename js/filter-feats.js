"use strict";

class PageFilterFeats extends PageFilter {
	// region static
	// endregion

	constructor () {
		super();

		this._asiFilter = getAsiFilter();
		this._otherPrereqFilter = new Filter({
			header: "Other",
			items: ["Ability", "Race", "Proficiency", "Special", "Spellcasting"]
		});
		this._levelFilter = new Filter({
			header: "Level",
			itemSortFn: SortUtil.ascSortNumericalSuffix
		});
		this._prerequisiteFilter = new MultiFilter({header: "Prerequisite", filters: [this._otherPrereqFilter, this._levelFilter]});
		this._miscFilter = new Filter({header: "Miscellaneous", items: ["SRD"]});
	}

	mutateForFilters (feat) {
		const ability = Renderer.getAbilityData(feat.ability);
		feat._fAbility = ability.asCollection.filter(a => !ability.areNegative.includes(a)); // used for filtering

		const prereqText = Renderer.utils.getPrerequisiteText(feat.prerequisite, true) || STR_NONE;

		const preSet = new Set();
		(feat.prerequisite || []).forEach(it => preSet.add(...Object.keys(it)));
		feat._fPrereqOther = [...preSet].map(it => (it === "other" ? "special" : it).uppercaseFirst());
		if (feat.prerequisite) feat._fPrereqLevel = feat.prerequisite.filter(it => it.level != null).map(it => `Level ${it.level.level}`);
		feat._fMisc = feat.srd ? ["SRD"] : [];

		feat._slAbility = ability.asText || STR_NONE;
		feat._slPrereq = prereqText;
	}

	addToFilters (feat, isExcluded) {
		if (isExcluded) return;

		this._sourceFilter.addItem(feat.source);
		if (feat.prerequisite) this._levelFilter.addItem(feat._fPrereqLevel);
	}

	async _pPopulateBoxOptions (opts) {
		opts.filters = [
			this._sourceFilter,
			this._asiFilter,
			this._prerequisiteFilter,
			this._miscFilter
		];
	}

	toDisplay (values, ft) {
		return this._filterBox.toDisplay(
			values,
			ft.source,
			ft._fAbility,
			[
				ft._fPrereqOther,
				ft._fPrereqLevel
			],
			ft._fMisc
		)
	}
}
