$(top).on('stonehearthReady', function () {

    App.StonehearthTeamCrafterView.reopen({
        _workshopInventoryDisplayOnIsVisibleChanged: function() {
            var visible = this.get('isVisible');
            if(visible) {
                var workshopInventoryDisplayFrame = App.gameView.getView(App.StonehearthWorkshopInventoryDisplayView);
                if (!workshopInventoryDisplayFrame || workshopInventoryDisplayFrame.isDestroyed) {
                    workshopInventoryDisplayFrame = App.gameView.addView(App.StonehearthWorkshopInventoryDisplayView,
                        {
                            currentRecipe: this.get('currentRecipe'),
                            mountPoint: this.$('#craftWindow').find('#tabs').eq(0)
                        });
                    workshopInventoryDisplayFrame.startTracking();
                } else {
                    workshopInventoryDisplayFrame.set('currentRecipe', this.get('currentRecipe'));
                    workshopInventoryDisplayFrame.set('mountPoint', this.$('#craftWindow').find('#tabs').eq(0));
                    workshopInventoryDisplayFrame._relocateTemplate();
                    workshopInventoryDisplayFrame.startTracking();
                }
            } else {
                workshopInventoryDisplayFrame = App.gameView.getView(App.StonehearthWorkshopInventoryDisplayView);
                if(workshopInventoryDisplayFrame) {
                    workshopInventoryDisplayFrame.stopTracking();
                }
            }
        }.observes('isVisible', 'currentRecipe'),

        destroy: function() {
            var view = App.gameView.getView(App.StonehearthWorkshopInventoryDisplayView);
            view.destroy();
            this._super();
        }
    });
});

App.StonehearthWorkshopInventoryDisplayView = App.View.extend({
    templateName: 'workshop_inventory_display',
    mainDiv: '#workshop_inventory_display',
    defaultMountpoint: '#craftWindow #tabs',
    mountPoint: null,
    uriProperty: 'model',
    currentRecipe: null,
    deployedCount: 0,
    undeployedCount: 0,
    basicInventoryTrace: null,
    itemTraces: {
        "tracking_data": {
            "*": {}
        }
    },
    inventoryItems: {
        equippedItems: {},
        stockedItems: {}
    },
    citizens: null,
    equippedItems: null,

    components: {
        "citizens" : {
            "*": {
                "stonehearth:equipment": {
                    "equipped_items": {
                        '*' : {}
                    }
                }
            }
        }
    },

    init: function () {
        var self = this;
        self._super(...arguments);

        radiant.call('stonehearth:get_population')
            .done(function(response){
                if (self.isDestroying || self.isDestroyed) {
                    return;
                }
                self.set('uri', response.population);
            });
    },

    didInsertElement: function () {
        var self = this;
        self._relocateTemplate();
        self._super(...arguments);
    },

    willDestroyElement: function () {
        this._super();
    },

    destroy: function () {
        if(this.basicInventoryTrace) {
            this.basicInventoryTrace.destroy();
            this.basicInventoryTrace = null;
        }
        this._super();
    },

    _onCitizens: function() {
        var self = this;
        var slots = App.characterSheetEquipmentSlots;
        var citizens = self.get('model.citizens');
        var allEquipment = [];

        radiant.each(citizens, function(i, citizen) {
            var citizenEquipment = citizen['stonehearth:equipment'];
            if(citizenEquipment) {
                var equipment = citizenEquipment.equipped_items;
                radiant.each(slots, function(i, slot) {
                    var equipmentPiece = equipment[slot];
                    if (equipmentPiece) {
                        var alias = equipmentPiece.get('uri');
                        allEquipment.push(alias);
                    }
                });
            }
        });

        var equipmentGroupedByUri = allEquipment.reduce(function(previousValue, currentValue) {
            if(previousValue[currentValue]) {
                previousValue[currentValue].count++;
            } else {
                previousValue[currentValue] = { uri: currentValue, count: 1 };
            }
            return previousValue;
        }, {});

        self.set('equippedItems', equipmentGroupedByUri);
    }.observes('model.citizens'),

    _onCurrentRecipeChanged: function() {
        var self = this;
        self._updateInventoryDisplay();
    }.observes('currentRecipe'),

    _onEquipmentChanged: function() {
        var self = this;
        var equipment = self.get('equippedItems');

        radiant.each(equipment, function(uri, item) {
            var rootUri = uri;
            var catalogData = App.catalog.getCatalogData(item.uri);
            if(catalogData && catalogData['root_entity_uri']) {
                rootUri = catalogData['root_entity_uri'];
                self._addItemToInventory(rootUri, item, false, self.inventoryItems.equippedItems);
            }
        });
        self._updateInventoryDisplay();
    }.observes('equippedItems'),

    _addItemToInventory: function(rootUri, item, isIconic, inventoryItems) {
        if (!inventoryItems[rootUri]) {
            inventoryItems[rootUri] = item;
            inventoryItems[rootUri].undeployedCount = 0; // set initial undeployed count
            if (isIconic) {
                // set undeployedCount
                inventoryItems[rootUri].undeployedCount = item.count;
                inventoryItems[rootUri].count = 0; // we just set the item into the array and it is undeployed, so remove the item count
            }
        } else {
            if (isIconic) {
                inventoryItems[rootUri].undeployedCount = item.count;
            } else {
                inventoryItems[rootUri].count = item.count;
            }
        }
    },

    _updateInventoryDisplay: function () {
        var self = this;
        var currentRecipe = self.currentRecipe;

        if (currentRecipe) {
            var equippedInventoryForCurrentRecipeProduct = self.inventoryItems.equippedItems[currentRecipe['product_uri']] || self.inventoryItems.equippedItems[currentRecipe['product_uri'].__self];
            var stockInventoryForCurrentRecipeProduct = self.inventoryItems.stockedItems[currentRecipe['product_uri']] || self.inventoryItems.stockedItems[currentRecipe['product_uri'].__self];

            var equippedCount = equippedInventoryForCurrentRecipeProduct ? equippedInventoryForCurrentRecipeProduct.count : 0;
            var stockDeployedCount = stockInventoryForCurrentRecipeProduct ? stockInventoryForCurrentRecipeProduct.count : 0;
            var stockUndeployedCount = stockInventoryForCurrentRecipeProduct ? stockInventoryForCurrentRecipeProduct.undeployedCount : 0;

            var deployedCount = equippedCount + stockDeployedCount;
            // update text
            self.set('undeployedCount', stockUndeployedCount);
            self.set('deployedCount', deployedCount);
        }
    },

    _relocateTemplate: function () {
        var self = this;

        var craftWindow = self.get('mountPoint');
        var inventoryWindow = $(self.mainDiv).detach();

        craftWindow.append(inventoryWindow);
    },

    startTracking: function() {
        var self = this;
        if(!self.basicInventoryTrace) {
            //init the inventory and usable object trackers
            radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:basic_inventory_tracker')
                .done(function (response) {
                    self.basicInventoryTrace = new StonehearthDataTrace(response.tracker, self.itemTraces)
                        .progress(function (response) {
                            radiant.each(response.tracking_data, function (uri, item) {
                                var rootUri = item.canonical_uri || uri;
                                var isIconic = false;
                                var catalogData = App.catalog.getCatalogData(uri);
                                if ((item.canonical_uri && item.canonical_uri !== item.uri) || (catalogData && catalogData['is_item'])) {
                                    isIconic = true;
                                }

                                self._addItemToInventory(rootUri, item, isIconic, self.inventoryItems.stockedItems);
                            });
                            self._updateInventoryDisplay();
                        });
                })
                .fail(function (response) {
                    console.error(response);
                });
        }
    },

    stopTracking: $.debounce(1, function () {
        var self = this;
        if(self.basicInventoryTrace) {
            self.basicInventoryTrace.destroy();
            self.basicInventoryTrace = null;
        }
    })
});
