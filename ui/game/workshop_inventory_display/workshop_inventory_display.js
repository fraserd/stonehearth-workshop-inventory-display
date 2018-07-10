$(top).on('stonehearthReady', function () {
    App.StonehearthTeamCrafterView.reopen({
        _workshopInventoryDisplayOnCurrentRecipeChanged: function() {
            var workshopInventoryDisplayFrame = App.gameView.getView(App.StonehearthWorkshopInventoryDisplayView);
            if (!workshopInventoryDisplayFrame || workshopInventoryDisplayFrame.isDestroyed) {
                App.gameView.addView(App.StonehearthWorkshopInventoryDisplayView,
                    { undeployedCount: 0, deployedCount: 0, currentRecipe: this.get('currentRecipe') });
            } else {
                workshopInventoryDisplayFrame.set('currentRecipe', this.get('currentRecipe'));
            }
        }.observes('currentRecipe'),

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
    uriProperty: 'model',
    currentRecipe: null,
    deployedCount: 0,
    undeployedCount: 0,
    basicInventoryTrace: null,
    itemTraces: {
        "tracking_data": {
            "*": {
                "uri" : {},
                "canonical_uri" : {}
            }
        }
    },
    inventoryItems: {},
    citizens: null,
    equippedItems: null,

    components: {
        "citizens" : {
            "*": {
                "stonehearth:equipment": {
                    "equipped_items": {
                        '*' : {
                            'uri': {},
                        }
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
                        var alias = equipmentPiece.get('uri').__self;
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
        var currentRecipe = self.currentRecipe;

        if (currentRecipe) {
            //init the inventory and usable object trackers
            radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:basic_inventory_tracker')
                .done(function (response) {
                    self.basicInventoryTrace = new StonehearthDataTrace(response.tracker, self.itemTraces)
                        .progress(function (response) {
                            var inventoryItems = {};
                            var equipment = self.get('equippedItems');
                            console.log(equipment);

                            radiant.each(equipment, function(uri, item) {
                                var rootUri = uri;
                                var catalogData = App.catalog.getCatalogData(item.uri);
                                if(catalogData) {
                                    rootUri = catalogData['root_entity_uri'];
                                    self._addItemToInventory(rootUri, item, false, inventoryItems);
                                }
                            });

                            radiant.each(response.tracking_data, function (uri, item) {
                                var rootUri = uri;
                                var isIconic = false;
                                var catalogData = App.catalog.getCatalogData(item.uri.__self);
                                if (item.canonical_uri && item.canonical_uri.__self !== item.uri.__self) {
                                    isIconic = true;
                                    // save the original uri
                                    item.orig_uri = rootUri;
                                    rootUri = item.canonical_uri.__self;
                                    item.uri = rootUri;
                                    item.isIconic = true;
                                } else if(catalogData.is_item) { // this should be the case for talisman items
                                    isIconic = true;
                                }

                                self._addItemToInventory(rootUri, item, isIconic, inventoryItems);
                            });
                            // update the inventory items that are read
                            self.inventoryItems = inventoryItems;
                            self._updateInventoryDisplay();
                        })
                        .done(function (response) {
                        });
                })
                .fail(function (response) {
                    console.error(response);
                });
        }
    }.observes('equippedItems', 'currentRecipe'),

    _addItemToInventory: function(rootUri, item, isIconic, inventoryItems) {
        if (!inventoryItems[rootUri]) {
            inventoryItems[rootUri] = item;
            inventoryItems[rootUri].undeployedCount = 0; // set initial undeployed count
            if (isIconic) {
                // set undeployedCount
                inventoryItems[rootUri].undeployedCount = inventoryItems[rootUri].undeployedCount + item.count;
                inventoryItems[rootUri].count = 0; // we just set the item into the array and it is undeployed, so remove the item count
            }
        } else {
            if (isIconic) {
                inventoryItems[rootUri].undeployedCount = inventoryItems[rootUri].undeployedCount + item.count;
            } else {
                inventoryItems[rootUri].count = inventoryItems[rootUri].count + item.count;
            }
        }
    },

    _updateInventoryDisplay: function () {
        var self = this;
        var currentRecipe = self.currentRecipe;

        if (currentRecipe) {
            var inventoryForCurrentRecipeProduct = self.inventoryItems[currentRecipe.product_uri.__self];
            if (inventoryForCurrentRecipeProduct) {
                // update text
                self.set('undeployedCount', inventoryForCurrentRecipeProduct.undeployedCount);
                self.set('deployedCount', inventoryForCurrentRecipeProduct.count);
            } else {
                self.set('undeployedCount', 0);
                self.set('deployedCount', 0);
            }
        }
    },

    _relocateTemplate: function (mountpoint) {
        var self = this;
        var mp = self.defaultMountpoint;
        if (mountpoint) {
            mp = mountpoint;
        }

        var craftWindow = $(mp);
        var inventoryWindow = $(self.mainDiv);

        craftWindow.append(inventoryWindow);
    },
});
