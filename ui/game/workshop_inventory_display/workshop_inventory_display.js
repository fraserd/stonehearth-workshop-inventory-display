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

    init: function () {
        this._super(...arguments);
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

                            radiant.each(response.tracking_data, function (uri, item) {
                                var rootUri = uri;
                                var isIconic = false;
                                if (item.canonical_uri && item.canonical_uri.__self !== item.uri.__self) {
                                    isIconic = true;
                                    // save the original uri
                                    item.orig_uri = rootUri;
                                    rootUri = item.canonical_uri.__self;
                                    item.uri = rootUri;
                                    item.isIconic = true;
                                } else if (item.canonical_uri === undefined) { // this should be the case for talisman items
                                    isIconic = true;
                                }

                                // if no record of this item type yet, make one
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
    }.observes('currentRecipe'),

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
