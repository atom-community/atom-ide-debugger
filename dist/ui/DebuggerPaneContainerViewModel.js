"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _constants = require("../constants");

var _DebuggerPaneViewModel = _interopRequireDefault(require("./DebuggerPaneViewModel"));

var _assert = _interopRequireDefault(require("assert"));

var React = _interopRequireWildcard(require("react"));

var _tabBarView = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-ui/VendorLib/atom-tabs/lib/tab-bar-view"));

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _View = require("@atom-ide-community/nuclide-commons-ui/View");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEBUGGER_TAB_TITLE = "Debugger";

class DebuggerPaneContainerViewModel {
  constructor(paneContainer, preferredWidth) {
    this._container = void 0;
    this._disposables = void 0;
    this._paneEvents = void 0;
    this._removedFromLayout = void 0;
    this._preferredWidth = void 0;
    this._disposables = new _UniversalDisposable.default();
    this._paneEvents = new Map();
    this._removedFromLayout = false;
    this._container = paneContainer;
    this._preferredWidth = preferredWidth;

    for (const pane of this._container.getPanes()) {
      this._deferredAddTabBarToEmptyPane(pane);

      this._addManagedPane(pane);
    }

    this._disposables.add(() => {
      this._forEachChildPaneItem(item => {
        (0, _assert.default)(item instanceof _DebuggerPaneViewModel.default || item instanceof DebuggerPaneContainerViewModel);
        item.setRemovedFromLayout(this._removedFromLayout);
        item.destroy();
      });

      this._container.destroy();
    }, paneContainer.onDidAddPane(event => {
      const pane = event.pane;

      this._kickOutNonDebuggerItems(pane);

      if (this._container.getPanes().indexOf(pane) < 0) {
        return;
      }

      if (!this._conditionallyAddTabBarToPane(pane)) {
        // Wait until the item(s) are added to the pane, and then add a tab bar
        // above them if and only if the item's title is not the same as the
        // container tabs title (we don't want duplicate tabs right beneath each other).
        this._deferredAddTabBarToEmptyPane(pane);
      }

      this._addManagedPane(pane);
    }), paneContainer.onWillDestroyPane(event => {
      const disposables = this._paneEvents.get(event.pane);

      if (disposables != null) {
        disposables.dispose();

        this._paneEvents.delete(event.pane);
      }
    }), paneContainer.onDidDestroyPane(event => {
      // If this container is now empty, destroy it!
      const panes = this._container.getPanes();

      if (panes.length === 0 || panes.length === 1 && panes[0].getItems().length === 0) {
        const parent = this.getParentPane();

        if (parent != null) {
          parent.removeItem(this);
        }
      }
    }));
  }

  _addManagedPane(pane) {
    let disposables = this._paneEvents.get(pane);

    if (disposables == null) {
      disposables = new _UniversalDisposable.default();

      this._paneEvents.set(pane, disposables);
    }

    disposables.add(pane.onDidAddItem(event => {
      this._kickOutNonDebuggerItems(pane);
    })); // Split operations on the child panes of this container are also being
    // executed on the parent pane that contains this container, which results
    // in very unexpected behavior. Prevent the parent pane from splitting.

    const parent = this.getParentPane();

    if (parent != null) {
      // $FlowFixMe
      parent.split = () => {};
    }
  } // If a pane is initially empty, don't add the tab bar until the first item
  // is added to the pane, otherwise we don't know what title to give the tab!


  _deferredAddTabBarToEmptyPane(pane) {
    const pendingAddTabDisposable = new _UniversalDisposable.default();
    pendingAddTabDisposable.add(pane.onDidAddItem(event => {
      if (this._conditionallyAddTabBarToPane(pane)) {
        this._disposables.remove(pendingAddTabDisposable);

        pendingAddTabDisposable.dispose();
      }
    }));

    this._disposables.add(pendingAddTabDisposable);
  }

  _conditionallyAddTabBarToPane(pane) {
    const items = pane.getItems();

    if (items.length > 0) {
      const item = items[0];

      if (item instanceof _DebuggerPaneViewModel.default) {
        if (item.getTitle() !== this.getTitle() || items.length > 1) {
          this._addTabBarToPane(pane);

          return true;
        }
      }
    }

    return false;
  } // Don't let the user add a non-debugger item to the debugger pane container. This is because
  // the container will get destroyed by the debugger going away or redoing layout, and we wouldn't
  // be able to preserve the user's other items.


  _kickOutNonDebuggerItems(pane) {
    for (const item of pane.getItems()) {
      if (item instanceof DebuggerPaneContainerViewModel) {
        if (item === this) {
          // If the container is dropped into itself, we've got a problem.
          // Call debugger:show, which will blow away this entire pane and redo
          // the debugger layout.
          // TODO: Better solution here.
          process.nextTick(() => {
            atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show");
          });
        } else {
          // This is another debugger pane container, which contains other debugger
          // panes. Move all the other container's items to this container, and\
          // then destroy the other container.
          const otherPanes = item._container.getPanes();

          for (const otherPane of otherPanes) {
            for (const otherItem of otherPane.getItems()) {
              const idx = pane.getItems().indexOf(item);
              otherPane.moveItemToPane(otherItem, pane, idx);
              otherPane.activateItemAtIndex(idx);
            }
          } // Destroy the (now empty) other pane container.


          process.nextTick(() => {
            pane.destroyItem(item);
          });
        }
      } else {
        // Kick the item out to the parent pane.
        if (!(item instanceof _DebuggerPaneViewModel.default)) {
          this._moveItemToParentPane(item, pane);
        }
      }
    }
  }

  _moveItemToParentPane(item, pane) {
    const parentPane = this.getParentPane();
    (0, _assert.default)(parentPane != null); // Kick the item out to the parent pane, which must be done on next tick because the drag
    // operation currently in progress needs the item not to be destroyed before the drag
    // completes.

    process.nextTick(() => {
      (0, _assert.default)(parentPane != null);
      pane.moveItemToPane(item, parentPane, parentPane.getItems().indexOf(this) + 1); // TODO: Atom bug? This is here because when setting this item active immediately after
      // moving, it sometimes (but not always) renders a blank pane...

      process.nextTick(() => {
        (0, _assert.default)(parentPane != null);
        parentPane.setActiveItem(item);
      });
    });
  }

  getParentPane() {
    for (const pane of atom.workspace.getPanes()) {
      for (const item of pane.getItems()) {
        if (item === this) {
          return pane;
        }
      }
    }

    return null;
  }

  _addTabBarToPane(pane) {
    const tabBarView = new _tabBarView.default(pane);
    const paneElement = atom.views.getView(pane);
    paneElement.insertBefore(tabBarView.element, paneElement.firstChild); // moveItemBetweenPanes conflicts with the parent tab's moveItemBetweenPanes.
    // Empty it out to get the correct behavior.

    tabBarView.moveItemBetweenPanes = () => {};

    tabBarView.element.classList.add("nuclide-workspace-views-panel-location-tabs");
  }

  dispose() {
    this._disposables.dispose();
  }

  destroy() {
    if (!this._removedFromLayout) {
      // We need to differentiate between the case where destroying this pane hides one or more
      // non-essential debugger views, and where it means the user is closing the debugger.
      //
      // If closing this pane would close a lifetime view, forward the destroy request to that view,
      // which will manage tearing down the debugger. Otherwise, we are simply hiding all panes
      // contained within this pane, which is accomplished by disposing this.
      for (const pane of this._container.getPanes()) {
        for (const item of pane.getItems()) {
          if (item instanceof _DebuggerPaneViewModel.default) {
            if (item.isLifetimeView()) {
              item.destroy();
              return;
            }
          }
        }
      }
    }

    this.dispose();
  }

  destroyWhere(callback) {
    this._forEachChildPaneItem((innerItem, pane) => {
      if (callback(innerItem)) {
        pane.destroyItem(innerItem);
      }
    });
  }

  getTitle() {
    return DEBUGGER_TAB_TITLE;
  }

  getIconName() {
    return "nuclicon-debugger";
  }

  getDefaultLocation() {
    return _constants.DEBUGGER_PANELS_DEFAULT_LOCATION;
  }

  getURI() {
    return "atom://nuclide/debugger-container";
  }

  getPreferredWidth() {
    return this._preferredWidth == null ? _constants.DEBUGGER_PANELS_DEFAULT_WIDTH_PX : this._preferredWidth;
  }

  createView() {
    return /*#__PURE__*/React.createElement(_View.View, {
      item: this._container
    });
  }

  setRemovedFromLayout(removed) {
    this._removedFromLayout = removed; // Propagate this command to the children of the pane container.

    this._forEachChildPaneItem(item => {
      if (item instanceof _DebuggerPaneViewModel.default) {
        item.setRemovedFromLayout(removed);
      }
    });
  }

  _forEachChildPaneItem(callback) {
    for (const pane of this._container.getPanes()) {
      pane.getItems().forEach(item => {
        callback(item, pane);
      });
    }
  }

  getAllItems() {
    const items = [];

    this._forEachChildPaneItem(item => {
      items.push(item);
    });

    return items;
  }

  serialize() {
    return {};
  }

  copy() {
    return false;
  }

}

exports.default = DebuggerPaneContainerViewModel;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbC5qcyJdLCJuYW1lcyI6WyJERUJVR0dFUl9UQUJfVElUTEUiLCJEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwiLCJjb25zdHJ1Y3RvciIsInBhbmVDb250YWluZXIiLCJwcmVmZXJyZWRXaWR0aCIsIl9jb250YWluZXIiLCJfZGlzcG9zYWJsZXMiLCJfcGFuZUV2ZW50cyIsIl9yZW1vdmVkRnJvbUxheW91dCIsIl9wcmVmZXJyZWRXaWR0aCIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJNYXAiLCJwYW5lIiwiZ2V0UGFuZXMiLCJfZGVmZXJyZWRBZGRUYWJCYXJUb0VtcHR5UGFuZSIsIl9hZGRNYW5hZ2VkUGFuZSIsImFkZCIsIl9mb3JFYWNoQ2hpbGRQYW5lSXRlbSIsIml0ZW0iLCJEZWJ1Z2dlclBhbmVWaWV3TW9kZWwiLCJzZXRSZW1vdmVkRnJvbUxheW91dCIsImRlc3Ryb3kiLCJvbkRpZEFkZFBhbmUiLCJldmVudCIsIl9raWNrT3V0Tm9uRGVidWdnZXJJdGVtcyIsImluZGV4T2YiLCJfY29uZGl0aW9uYWxseUFkZFRhYkJhclRvUGFuZSIsIm9uV2lsbERlc3Ryb3lQYW5lIiwiZGlzcG9zYWJsZXMiLCJnZXQiLCJkaXNwb3NlIiwiZGVsZXRlIiwib25EaWREZXN0cm95UGFuZSIsInBhbmVzIiwibGVuZ3RoIiwiZ2V0SXRlbXMiLCJwYXJlbnQiLCJnZXRQYXJlbnRQYW5lIiwicmVtb3ZlSXRlbSIsInNldCIsIm9uRGlkQWRkSXRlbSIsInNwbGl0IiwicGVuZGluZ0FkZFRhYkRpc3Bvc2FibGUiLCJyZW1vdmUiLCJpdGVtcyIsImdldFRpdGxlIiwiX2FkZFRhYkJhclRvUGFuZSIsInByb2Nlc3MiLCJuZXh0VGljayIsImF0b20iLCJjb21tYW5kcyIsImRpc3BhdGNoIiwidmlld3MiLCJnZXRWaWV3Iiwid29ya3NwYWNlIiwib3RoZXJQYW5lcyIsIm90aGVyUGFuZSIsIm90aGVySXRlbSIsImlkeCIsIm1vdmVJdGVtVG9QYW5lIiwiYWN0aXZhdGVJdGVtQXRJbmRleCIsImRlc3Ryb3lJdGVtIiwiX21vdmVJdGVtVG9QYXJlbnRQYW5lIiwicGFyZW50UGFuZSIsInNldEFjdGl2ZUl0ZW0iLCJ0YWJCYXJWaWV3IiwiVGFiQmFyVmlldyIsInBhbmVFbGVtZW50IiwiaW5zZXJ0QmVmb3JlIiwiZWxlbWVudCIsImZpcnN0Q2hpbGQiLCJtb3ZlSXRlbUJldHdlZW5QYW5lcyIsImNsYXNzTGlzdCIsImlzTGlmZXRpbWVWaWV3IiwiZGVzdHJveVdoZXJlIiwiY2FsbGJhY2siLCJpbm5lckl0ZW0iLCJnZXRJY29uTmFtZSIsImdldERlZmF1bHRMb2NhdGlvbiIsIkRFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OIiwiZ2V0VVJJIiwiZ2V0UHJlZmVycmVkV2lkdGgiLCJERUJVR0dFUl9QQU5FTFNfREVGQVVMVF9XSURUSF9QWCIsImNyZWF0ZVZpZXciLCJyZW1vdmVkIiwiZm9yRWFjaCIsImdldEFsbEl0ZW1zIiwicHVzaCIsInNlcmlhbGl6ZSIsImNvcHkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxrQkFBa0IsR0FBRyxVQUEzQjs7QUFFZSxNQUFNQyw4QkFBTixDQUFxQztBQU9sREMsRUFBQUEsV0FBVyxDQUFDQyxhQUFELEVBQW9DQyxjQUFwQyxFQUE2RDtBQUFBLFNBTnhFQyxVQU13RTtBQUFBLFNBTHhFQyxZQUt3RTtBQUFBLFNBSnhFQyxXQUl3RTtBQUFBLFNBSHhFQyxrQkFHd0U7QUFBQSxTQUZ4RUMsZUFFd0U7QUFDdEUsU0FBS0gsWUFBTCxHQUFvQixJQUFJSSw0QkFBSixFQUFwQjtBQUNBLFNBQUtILFdBQUwsR0FBbUIsSUFBSUksR0FBSixFQUFuQjtBQUNBLFNBQUtILGtCQUFMLEdBQTBCLEtBQTFCO0FBQ0EsU0FBS0gsVUFBTCxHQUFrQkYsYUFBbEI7QUFDQSxTQUFLTSxlQUFMLEdBQXVCTCxjQUF2Qjs7QUFFQSxTQUFLLE1BQU1RLElBQVgsSUFBbUIsS0FBS1AsVUFBTCxDQUFnQlEsUUFBaEIsRUFBbkIsRUFBK0M7QUFDN0MsV0FBS0MsNkJBQUwsQ0FBbUNGLElBQW5DOztBQUNBLFdBQUtHLGVBQUwsQ0FBcUJILElBQXJCO0FBQ0Q7O0FBRUQsU0FBS04sWUFBTCxDQUFrQlUsR0FBbEIsQ0FDRSxNQUFNO0FBQ0osV0FBS0MscUJBQUwsQ0FBNEJDLElBQUQsSUFBeUI7QUFDbEQsNkJBQVVBLElBQUksWUFBWUMsOEJBQWhCLElBQXlDRCxJQUFJLFlBQVlqQiw4QkFBbkU7QUFDQWlCLFFBQUFBLElBQUksQ0FBQ0Usb0JBQUwsQ0FBMEIsS0FBS1osa0JBQS9CO0FBQ0FVLFFBQUFBLElBQUksQ0FBQ0csT0FBTDtBQUNELE9BSkQ7O0FBS0EsV0FBS2hCLFVBQUwsQ0FBZ0JnQixPQUFoQjtBQUNELEtBUkgsRUFTRWxCLGFBQWEsQ0FBQ21CLFlBQWQsQ0FBNEJDLEtBQUQsSUFBVztBQUNwQyxZQUFNWCxJQUFJLEdBQUdXLEtBQUssQ0FBQ1gsSUFBbkI7O0FBRUEsV0FBS1ksd0JBQUwsQ0FBOEJaLElBQTlCOztBQUNBLFVBQUksS0FBS1AsVUFBTCxDQUFnQlEsUUFBaEIsR0FBMkJZLE9BQTNCLENBQW1DYixJQUFuQyxJQUEyQyxDQUEvQyxFQUFrRDtBQUNoRDtBQUNEOztBQUVELFVBQUksQ0FBQyxLQUFLYyw2QkFBTCxDQUFtQ2QsSUFBbkMsQ0FBTCxFQUErQztBQUM3QztBQUNBO0FBQ0E7QUFDQSxhQUFLRSw2QkFBTCxDQUFtQ0YsSUFBbkM7QUFDRDs7QUFFRCxXQUFLRyxlQUFMLENBQXFCSCxJQUFyQjtBQUNELEtBaEJELENBVEYsRUEwQkVULGFBQWEsQ0FBQ3dCLGlCQUFkLENBQWlDSixLQUFELElBQVc7QUFDekMsWUFBTUssV0FBVyxHQUFHLEtBQUtyQixXQUFMLENBQWlCc0IsR0FBakIsQ0FBcUJOLEtBQUssQ0FBQ1gsSUFBM0IsQ0FBcEI7O0FBQ0EsVUFBSWdCLFdBQVcsSUFBSSxJQUFuQixFQUF5QjtBQUN2QkEsUUFBQUEsV0FBVyxDQUFDRSxPQUFaOztBQUNBLGFBQUt2QixXQUFMLENBQWlCd0IsTUFBakIsQ0FBd0JSLEtBQUssQ0FBQ1gsSUFBOUI7QUFDRDtBQUNGLEtBTkQsQ0ExQkYsRUFpQ0VULGFBQWEsQ0FBQzZCLGdCQUFkLENBQWdDVCxLQUFELElBQVc7QUFDeEM7QUFDQSxZQUFNVSxLQUFLLEdBQUcsS0FBSzVCLFVBQUwsQ0FBZ0JRLFFBQWhCLEVBQWQ7O0FBQ0EsVUFBSW9CLEtBQUssQ0FBQ0MsTUFBTixLQUFpQixDQUFqQixJQUF1QkQsS0FBSyxDQUFDQyxNQUFOLEtBQWlCLENBQWpCLElBQXNCRCxLQUFLLENBQUMsQ0FBRCxDQUFMLENBQVNFLFFBQVQsR0FBb0JELE1BQXBCLEtBQStCLENBQWhGLEVBQW9GO0FBQ2xGLGNBQU1FLE1BQU0sR0FBRyxLQUFLQyxhQUFMLEVBQWY7O0FBQ0EsWUFBSUQsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEJBLFVBQUFBLE1BQU0sQ0FBQ0UsVUFBUCxDQUFrQixJQUFsQjtBQUNEO0FBQ0Y7QUFDRixLQVRELENBakNGO0FBNENEOztBQUVEdkIsRUFBQUEsZUFBZSxDQUFDSCxJQUFELEVBQXdCO0FBQ3JDLFFBQUlnQixXQUFXLEdBQUcsS0FBS3JCLFdBQUwsQ0FBaUJzQixHQUFqQixDQUFxQmpCLElBQXJCLENBQWxCOztBQUNBLFFBQUlnQixXQUFXLElBQUksSUFBbkIsRUFBeUI7QUFDdkJBLE1BQUFBLFdBQVcsR0FBRyxJQUFJbEIsNEJBQUosRUFBZDs7QUFDQSxXQUFLSCxXQUFMLENBQWlCZ0MsR0FBakIsQ0FBcUIzQixJQUFyQixFQUEyQmdCLFdBQTNCO0FBQ0Q7O0FBRURBLElBQUFBLFdBQVcsQ0FBQ1osR0FBWixDQUNFSixJQUFJLENBQUM0QixZQUFMLENBQW1CakIsS0FBRCxJQUFXO0FBQzNCLFdBQUtDLHdCQUFMLENBQThCWixJQUE5QjtBQUNELEtBRkQsQ0FERixFQVBxQyxDQWFyQztBQUNBO0FBQ0E7O0FBQ0EsVUFBTXdCLE1BQU0sR0FBRyxLQUFLQyxhQUFMLEVBQWY7O0FBQ0EsUUFBSUQsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEI7QUFDQUEsTUFBQUEsTUFBTSxDQUFDSyxLQUFQLEdBQWUsTUFBTSxDQUFFLENBQXZCO0FBQ0Q7QUFDRixHQXRGaUQsQ0F3RmxEO0FBQ0E7OztBQUNBM0IsRUFBQUEsNkJBQTZCLENBQUNGLElBQUQsRUFBd0I7QUFDbkQsVUFBTThCLHVCQUF1QixHQUFHLElBQUloQyw0QkFBSixFQUFoQztBQUNBZ0MsSUFBQUEsdUJBQXVCLENBQUMxQixHQUF4QixDQUNFSixJQUFJLENBQUM0QixZQUFMLENBQW1CakIsS0FBRCxJQUFXO0FBQzNCLFVBQUksS0FBS0csNkJBQUwsQ0FBbUNkLElBQW5DLENBQUosRUFBOEM7QUFDNUMsYUFBS04sWUFBTCxDQUFrQnFDLE1BQWxCLENBQXlCRCx1QkFBekI7O0FBQ0FBLFFBQUFBLHVCQUF1QixDQUFDWixPQUF4QjtBQUNEO0FBQ0YsS0FMRCxDQURGOztBQVFBLFNBQUt4QixZQUFMLENBQWtCVSxHQUFsQixDQUFzQjBCLHVCQUF0QjtBQUNEOztBQUVEaEIsRUFBQUEsNkJBQTZCLENBQUNkLElBQUQsRUFBMkI7QUFDdEQsVUFBTWdDLEtBQUssR0FBR2hDLElBQUksQ0FBQ3VCLFFBQUwsRUFBZDs7QUFDQSxRQUFJUyxLQUFLLENBQUNWLE1BQU4sR0FBZSxDQUFuQixFQUFzQjtBQUNwQixZQUFNaEIsSUFBSSxHQUFHMEIsS0FBSyxDQUFDLENBQUQsQ0FBbEI7O0FBQ0EsVUFBSTFCLElBQUksWUFBWUMsOEJBQXBCLEVBQTJDO0FBQ3pDLFlBQUlELElBQUksQ0FBQzJCLFFBQUwsT0FBb0IsS0FBS0EsUUFBTCxFQUFwQixJQUF1Q0QsS0FBSyxDQUFDVixNQUFOLEdBQWUsQ0FBMUQsRUFBNkQ7QUFDM0QsZUFBS1ksZ0JBQUwsQ0FBc0JsQyxJQUF0Qjs7QUFDQSxpQkFBTyxJQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUVELFdBQU8sS0FBUDtBQUNELEdBcEhpRCxDQXNIbEQ7QUFDQTtBQUNBOzs7QUFDQVksRUFBQUEsd0JBQXdCLENBQUNaLElBQUQsRUFBd0I7QUFDOUMsU0FBSyxNQUFNTSxJQUFYLElBQW1CTixJQUFJLENBQUN1QixRQUFMLEVBQW5CLEVBQW9DO0FBQ2xDLFVBQUlqQixJQUFJLFlBQVlqQiw4QkFBcEIsRUFBb0Q7QUFDbEQsWUFBSWlCLElBQUksS0FBSyxJQUFiLEVBQW1CO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E2QixVQUFBQSxPQUFPLENBQUNDLFFBQVIsQ0FBaUIsTUFBTTtBQUNyQkMsWUFBQUEsSUFBSSxDQUFDQyxRQUFMLENBQWNDLFFBQWQsQ0FBdUJGLElBQUksQ0FBQ0csS0FBTCxDQUFXQyxPQUFYLENBQW1CSixJQUFJLENBQUNLLFNBQXhCLENBQXZCLEVBQTJELGVBQTNEO0FBQ0QsV0FGRDtBQUdELFNBUkQsTUFRTztBQUNMO0FBQ0E7QUFDQTtBQUNBLGdCQUFNQyxVQUFVLEdBQUdyQyxJQUFJLENBQUNiLFVBQUwsQ0FBZ0JRLFFBQWhCLEVBQW5COztBQUNBLGVBQUssTUFBTTJDLFNBQVgsSUFBd0JELFVBQXhCLEVBQW9DO0FBQ2xDLGlCQUFLLE1BQU1FLFNBQVgsSUFBd0JELFNBQVMsQ0FBQ3JCLFFBQVYsRUFBeEIsRUFBOEM7QUFDNUMsb0JBQU11QixHQUFHLEdBQUc5QyxJQUFJLENBQUN1QixRQUFMLEdBQWdCVixPQUFoQixDQUF3QlAsSUFBeEIsQ0FBWjtBQUNBc0MsY0FBQUEsU0FBUyxDQUFDRyxjQUFWLENBQXlCRixTQUF6QixFQUFvQzdDLElBQXBDLEVBQTBDOEMsR0FBMUM7QUFDQUYsY0FBQUEsU0FBUyxDQUFDSSxtQkFBVixDQUE4QkYsR0FBOUI7QUFDRDtBQUNGLFdBWEksQ0FhTDs7O0FBQ0FYLFVBQUFBLE9BQU8sQ0FBQ0MsUUFBUixDQUFpQixNQUFNO0FBQ3JCcEMsWUFBQUEsSUFBSSxDQUFDaUQsV0FBTCxDQUFpQjNDLElBQWpCO0FBQ0QsV0FGRDtBQUdEO0FBQ0YsT0EzQkQsTUEyQk87QUFDTDtBQUNBLFlBQUksRUFBRUEsSUFBSSxZQUFZQyw4QkFBbEIsQ0FBSixFQUE4QztBQUM1QyxlQUFLMkMscUJBQUwsQ0FBMkI1QyxJQUEzQixFQUFpQ04sSUFBakM7QUFDRDtBQUNGO0FBQ0Y7QUFDRjs7QUFFRGtELEVBQUFBLHFCQUFxQixDQUFDNUMsSUFBRCxFQUFzQk4sSUFBdEIsRUFBNkM7QUFDaEUsVUFBTW1ELFVBQVUsR0FBRyxLQUFLMUIsYUFBTCxFQUFuQjtBQUNBLHlCQUFVMEIsVUFBVSxJQUFJLElBQXhCLEVBRmdFLENBSWhFO0FBQ0E7QUFDQTs7QUFDQWhCLElBQUFBLE9BQU8sQ0FBQ0MsUUFBUixDQUFpQixNQUFNO0FBQ3JCLDJCQUFVZSxVQUFVLElBQUksSUFBeEI7QUFDQW5ELE1BQUFBLElBQUksQ0FBQytDLGNBQUwsQ0FBb0J6QyxJQUFwQixFQUEwQjZDLFVBQTFCLEVBQXNDQSxVQUFVLENBQUM1QixRQUFYLEdBQXNCVixPQUF0QixDQUE4QixJQUE5QixJQUFzQyxDQUE1RSxFQUZxQixDQUlyQjtBQUNBOztBQUNBc0IsTUFBQUEsT0FBTyxDQUFDQyxRQUFSLENBQWlCLE1BQU07QUFDckIsNkJBQVVlLFVBQVUsSUFBSSxJQUF4QjtBQUNBQSxRQUFBQSxVQUFVLENBQUNDLGFBQVgsQ0FBeUI5QyxJQUF6QjtBQUNELE9BSEQ7QUFJRCxLQVZEO0FBV0Q7O0FBRURtQixFQUFBQSxhQUFhLEdBQWU7QUFDMUIsU0FBSyxNQUFNekIsSUFBWCxJQUFtQnFDLElBQUksQ0FBQ0ssU0FBTCxDQUFlekMsUUFBZixFQUFuQixFQUE4QztBQUM1QyxXQUFLLE1BQU1LLElBQVgsSUFBbUJOLElBQUksQ0FBQ3VCLFFBQUwsRUFBbkIsRUFBb0M7QUFDbEMsWUFBSWpCLElBQUksS0FBSyxJQUFiLEVBQW1CO0FBQ2pCLGlCQUFPTixJQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUNELFdBQU8sSUFBUDtBQUNEOztBQUVEa0MsRUFBQUEsZ0JBQWdCLENBQUNsQyxJQUFELEVBQXdCO0FBQ3RDLFVBQU1xRCxVQUFVLEdBQUcsSUFBSUMsbUJBQUosQ0FBZXRELElBQWYsQ0FBbkI7QUFDQSxVQUFNdUQsV0FBVyxHQUFHbEIsSUFBSSxDQUFDRyxLQUFMLENBQVdDLE9BQVgsQ0FBbUJ6QyxJQUFuQixDQUFwQjtBQUNBdUQsSUFBQUEsV0FBVyxDQUFDQyxZQUFaLENBQXlCSCxVQUFVLENBQUNJLE9BQXBDLEVBQTZDRixXQUFXLENBQUNHLFVBQXpELEVBSHNDLENBS3RDO0FBQ0E7O0FBQ0FMLElBQUFBLFVBQVUsQ0FBQ00sb0JBQVgsR0FBa0MsTUFBTSxDQUFFLENBQTFDOztBQUNBTixJQUFBQSxVQUFVLENBQUNJLE9BQVgsQ0FBbUJHLFNBQW5CLENBQTZCeEQsR0FBN0IsQ0FBaUMsNkNBQWpDO0FBQ0Q7O0FBRURjLEVBQUFBLE9BQU8sR0FBUztBQUNkLFNBQUt4QixZQUFMLENBQWtCd0IsT0FBbEI7QUFDRDs7QUFFRFQsRUFBQUEsT0FBTyxHQUFTO0FBQ2QsUUFBSSxDQUFDLEtBQUtiLGtCQUFWLEVBQThCO0FBQzVCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFdBQUssTUFBTUksSUFBWCxJQUFtQixLQUFLUCxVQUFMLENBQWdCUSxRQUFoQixFQUFuQixFQUErQztBQUM3QyxhQUFLLE1BQU1LLElBQVgsSUFBbUJOLElBQUksQ0FBQ3VCLFFBQUwsRUFBbkIsRUFBb0M7QUFDbEMsY0FBSWpCLElBQUksWUFBWUMsOEJBQXBCLEVBQTJDO0FBQ3pDLGdCQUFJRCxJQUFJLENBQUN1RCxjQUFMLEVBQUosRUFBMkI7QUFDekJ2RCxjQUFBQSxJQUFJLENBQUNHLE9BQUw7QUFDQTtBQUNEO0FBQ0Y7QUFDRjtBQUNGO0FBQ0Y7O0FBRUQsU0FBS1MsT0FBTDtBQUNEOztBQUVENEMsRUFBQUEsWUFBWSxDQUFDQyxRQUFELEVBQTJDO0FBQ3JELFNBQUsxRCxxQkFBTCxDQUEyQixDQUFDMkQsU0FBRCxFQUFZaEUsSUFBWixLQUFxQjtBQUM5QyxVQUFJK0QsUUFBUSxDQUFDQyxTQUFELENBQVosRUFBeUI7QUFDdkJoRSxRQUFBQSxJQUFJLENBQUNpRCxXQUFMLENBQWlCZSxTQUFqQjtBQUNEO0FBQ0YsS0FKRDtBQUtEOztBQUVEL0IsRUFBQUEsUUFBUSxHQUFXO0FBQ2pCLFdBQU83QyxrQkFBUDtBQUNEOztBQUVENkUsRUFBQUEsV0FBVyxHQUFXO0FBQ3BCLFdBQU8sbUJBQVA7QUFDRDs7QUFFREMsRUFBQUEsa0JBQWtCLEdBQVc7QUFDM0IsV0FBT0MsMkNBQVA7QUFDRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFXO0FBQ2YsV0FBTyxtQ0FBUDtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBVztBQUMxQixXQUFPLEtBQUt4RSxlQUFMLElBQXdCLElBQXhCLEdBQStCeUUsMkNBQS9CLEdBQWtFLEtBQUt6RSxlQUE5RTtBQUNEOztBQUVEMEUsRUFBQUEsVUFBVSxHQUF1QjtBQUMvQix3QkFBTyxvQkFBQyxVQUFEO0FBQU0sTUFBQSxJQUFJLEVBQUUsS0FBSzlFO0FBQWpCLE1BQVA7QUFDRDs7QUFFRGUsRUFBQUEsb0JBQW9CLENBQUNnRSxPQUFELEVBQXlCO0FBQzNDLFNBQUs1RSxrQkFBTCxHQUEwQjRFLE9BQTFCLENBRDJDLENBRzNDOztBQUNBLFNBQUtuRSxxQkFBTCxDQUE0QkMsSUFBRCxJQUFVO0FBQ25DLFVBQUlBLElBQUksWUFBWUMsOEJBQXBCLEVBQTJDO0FBQ3pDRCxRQUFBQSxJQUFJLENBQUNFLG9CQUFMLENBQTBCZ0UsT0FBMUI7QUFDRDtBQUNGLEtBSkQ7QUFLRDs7QUFFRG5FLEVBQUFBLHFCQUFxQixDQUFDMEQsUUFBRCxFQUFpRTtBQUNwRixTQUFLLE1BQU0vRCxJQUFYLElBQW1CLEtBQUtQLFVBQUwsQ0FBZ0JRLFFBQWhCLEVBQW5CLEVBQStDO0FBQzdDRCxNQUFBQSxJQUFJLENBQUN1QixRQUFMLEdBQWdCa0QsT0FBaEIsQ0FBeUJuRSxJQUFELElBQVU7QUFDaEN5RCxRQUFBQSxRQUFRLENBQUN6RCxJQUFELEVBQU9OLElBQVAsQ0FBUjtBQUNELE9BRkQ7QUFHRDtBQUNGOztBQUVEMEUsRUFBQUEsV0FBVyxHQUF5QjtBQUNsQyxVQUFNMUMsS0FBSyxHQUFHLEVBQWQ7O0FBQ0EsU0FBSzNCLHFCQUFMLENBQTRCQyxJQUFELElBQVU7QUFDbkMwQixNQUFBQSxLQUFLLENBQUMyQyxJQUFOLENBQVdyRSxJQUFYO0FBQ0QsS0FGRDs7QUFJQSxXQUFPMEIsS0FBUDtBQUNEOztBQUVENEMsRUFBQUEsU0FBUyxHQUFXO0FBQ2xCLFdBQU8sRUFBUDtBQUNEOztBQUVEQyxFQUFBQSxJQUFJLEdBQVk7QUFDZCxXQUFPLEtBQVA7QUFDRDs7QUF0U2lEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfV0lEVEhfUFgsIERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgRGVidWdnZXJQYW5lVmlld01vZGVsIGZyb20gXCIuL0RlYnVnZ2VyUGFuZVZpZXdNb2RlbFwiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBUYWJCYXJWaWV3IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9WZW5kb3JMaWIvYXRvbS10YWJzL2xpYi90YWItYmFyLXZpZXdcIlxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IHsgVmlldyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9WaWV3XCJcblxuY29uc3QgREVCVUdHRVJfVEFCX1RJVExFID0gXCJEZWJ1Z2dlclwiXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbCB7XG4gIF9jb250YWluZXI6IGF0b20kUGFuZUNvbnRhaW5lclxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcbiAgX3BhbmVFdmVudHM6IE1hcDxhdG9tJFBhbmUsIFVuaXZlcnNhbERpc3Bvc2FibGU+XG4gIF9yZW1vdmVkRnJvbUxheW91dDogYm9vbGVhblxuICBfcHJlZmVycmVkV2lkdGg6ID9udW1iZXJcblxuICBjb25zdHJ1Y3RvcihwYW5lQ29udGFpbmVyOiBhdG9tJFBhbmVDb250YWluZXIsIHByZWZlcnJlZFdpZHRoOiA/bnVtYmVyKSB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fcGFuZUV2ZW50cyA9IG5ldyBNYXAoKVxuICAgIHRoaXMuX3JlbW92ZWRGcm9tTGF5b3V0ID0gZmFsc2VcbiAgICB0aGlzLl9jb250YWluZXIgPSBwYW5lQ29udGFpbmVyXG4gICAgdGhpcy5fcHJlZmVycmVkV2lkdGggPSBwcmVmZXJyZWRXaWR0aFxuXG4gICAgZm9yIChjb25zdCBwYW5lIG9mIHRoaXMuX2NvbnRhaW5lci5nZXRQYW5lcygpKSB7XG4gICAgICB0aGlzLl9kZWZlcnJlZEFkZFRhYkJhclRvRW1wdHlQYW5lKHBhbmUpXG4gICAgICB0aGlzLl9hZGRNYW5hZ2VkUGFuZShwYW5lKVxuICAgIH1cblxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgICgpID0+IHtcbiAgICAgICAgdGhpcy5fZm9yRWFjaENoaWxkUGFuZUl0ZW0oKGl0ZW06IGF0b20kUGFuZUl0ZW0pID0+IHtcbiAgICAgICAgICBpbnZhcmlhbnQoaXRlbSBpbnN0YW5jZW9mIERlYnVnZ2VyUGFuZVZpZXdNb2RlbCB8fCBpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsKVxuICAgICAgICAgIGl0ZW0uc2V0UmVtb3ZlZEZyb21MYXlvdXQodGhpcy5fcmVtb3ZlZEZyb21MYXlvdXQpXG4gICAgICAgICAgaXRlbS5kZXN0cm95KClcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5fY29udGFpbmVyLmRlc3Ryb3koKVxuICAgICAgfSxcbiAgICAgIHBhbmVDb250YWluZXIub25EaWRBZGRQYW5lKChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCBwYW5lID0gZXZlbnQucGFuZVxuXG4gICAgICAgIHRoaXMuX2tpY2tPdXROb25EZWJ1Z2dlckl0ZW1zKHBhbmUpXG4gICAgICAgIGlmICh0aGlzLl9jb250YWluZXIuZ2V0UGFuZXMoKS5pbmRleE9mKHBhbmUpIDwgMCkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9jb25kaXRpb25hbGx5QWRkVGFiQmFyVG9QYW5lKHBhbmUpKSB7XG4gICAgICAgICAgLy8gV2FpdCB1bnRpbCB0aGUgaXRlbShzKSBhcmUgYWRkZWQgdG8gdGhlIHBhbmUsIGFuZCB0aGVuIGFkZCBhIHRhYiBiYXJcbiAgICAgICAgICAvLyBhYm92ZSB0aGVtIGlmIGFuZCBvbmx5IGlmIHRoZSBpdGVtJ3MgdGl0bGUgaXMgbm90IHRoZSBzYW1lIGFzIHRoZVxuICAgICAgICAgIC8vIGNvbnRhaW5lciB0YWJzIHRpdGxlICh3ZSBkb24ndCB3YW50IGR1cGxpY2F0ZSB0YWJzIHJpZ2h0IGJlbmVhdGggZWFjaCBvdGhlcikuXG4gICAgICAgICAgdGhpcy5fZGVmZXJyZWRBZGRUYWJCYXJUb0VtcHR5UGFuZShwYW5lKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYWRkTWFuYWdlZFBhbmUocGFuZSlcbiAgICAgIH0pLFxuICAgICAgcGFuZUNvbnRhaW5lci5vbldpbGxEZXN0cm95UGFuZSgoZXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9wYW5lRXZlbnRzLmdldChldmVudC5wYW5lKVxuICAgICAgICBpZiAoZGlzcG9zYWJsZXMgIT0gbnVsbCkge1xuICAgICAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgICAgIHRoaXMuX3BhbmVFdmVudHMuZGVsZXRlKGV2ZW50LnBhbmUpXG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgcGFuZUNvbnRhaW5lci5vbkRpZERlc3Ryb3lQYW5lKChldmVudCkgPT4ge1xuICAgICAgICAvLyBJZiB0aGlzIGNvbnRhaW5lciBpcyBub3cgZW1wdHksIGRlc3Ryb3kgaXQhXG4gICAgICAgIGNvbnN0IHBhbmVzID0gdGhpcy5fY29udGFpbmVyLmdldFBhbmVzKClcbiAgICAgICAgaWYgKHBhbmVzLmxlbmd0aCA9PT0gMCB8fCAocGFuZXMubGVuZ3RoID09PSAxICYmIHBhbmVzWzBdLmdldEl0ZW1zKCkubGVuZ3RoID09PSAwKSkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuZ2V0UGFyZW50UGFuZSgpXG4gICAgICAgICAgaWYgKHBhcmVudCAhPSBudWxsKSB7XG4gICAgICAgICAgICBwYXJlbnQucmVtb3ZlSXRlbSh0aGlzKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApXG4gIH1cblxuICBfYWRkTWFuYWdlZFBhbmUocGFuZTogYXRvbSRQYW5lKTogdm9pZCB7XG4gICAgbGV0IGRpc3Bvc2FibGVzID0gdGhpcy5fcGFuZUV2ZW50cy5nZXQocGFuZSlcbiAgICBpZiAoZGlzcG9zYWJsZXMgPT0gbnVsbCkge1xuICAgICAgZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgICB0aGlzLl9wYW5lRXZlbnRzLnNldChwYW5lLCBkaXNwb3NhYmxlcylcbiAgICB9XG5cbiAgICBkaXNwb3NhYmxlcy5hZGQoXG4gICAgICBwYW5lLm9uRGlkQWRkSXRlbSgoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5fa2lja091dE5vbkRlYnVnZ2VySXRlbXMocGFuZSlcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgLy8gU3BsaXQgb3BlcmF0aW9ucyBvbiB0aGUgY2hpbGQgcGFuZXMgb2YgdGhpcyBjb250YWluZXIgYXJlIGFsc28gYmVpbmdcbiAgICAvLyBleGVjdXRlZCBvbiB0aGUgcGFyZW50IHBhbmUgdGhhdCBjb250YWlucyB0aGlzIGNvbnRhaW5lciwgd2hpY2ggcmVzdWx0c1xuICAgIC8vIGluIHZlcnkgdW5leHBlY3RlZCBiZWhhdmlvci4gUHJldmVudCB0aGUgcGFyZW50IHBhbmUgZnJvbSBzcGxpdHRpbmcuXG4gICAgY29uc3QgcGFyZW50ID0gdGhpcy5nZXRQYXJlbnRQYW5lKClcbiAgICBpZiAocGFyZW50ICE9IG51bGwpIHtcbiAgICAgIC8vICRGbG93Rml4TWVcbiAgICAgIHBhcmVudC5zcGxpdCA9ICgpID0+IHt9XG4gICAgfVxuICB9XG5cbiAgLy8gSWYgYSBwYW5lIGlzIGluaXRpYWxseSBlbXB0eSwgZG9uJ3QgYWRkIHRoZSB0YWIgYmFyIHVudGlsIHRoZSBmaXJzdCBpdGVtXG4gIC8vIGlzIGFkZGVkIHRvIHRoZSBwYW5lLCBvdGhlcndpc2Ugd2UgZG9uJ3Qga25vdyB3aGF0IHRpdGxlIHRvIGdpdmUgdGhlIHRhYiFcbiAgX2RlZmVycmVkQWRkVGFiQmFyVG9FbXB0eVBhbmUocGFuZTogYXRvbSRQYW5lKTogdm9pZCB7XG4gICAgY29uc3QgcGVuZGluZ0FkZFRhYkRpc3Bvc2FibGUgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgcGVuZGluZ0FkZFRhYkRpc3Bvc2FibGUuYWRkKFxuICAgICAgcGFuZS5vbkRpZEFkZEl0ZW0oKGV2ZW50KSA9PiB7XG4gICAgICAgIGlmICh0aGlzLl9jb25kaXRpb25hbGx5QWRkVGFiQmFyVG9QYW5lKHBhbmUpKSB7XG4gICAgICAgICAgdGhpcy5fZGlzcG9zYWJsZXMucmVtb3ZlKHBlbmRpbmdBZGRUYWJEaXNwb3NhYmxlKVxuICAgICAgICAgIHBlbmRpbmdBZGRUYWJEaXNwb3NhYmxlLmRpc3Bvc2UoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQocGVuZGluZ0FkZFRhYkRpc3Bvc2FibGUpXG4gIH1cblxuICBfY29uZGl0aW9uYWxseUFkZFRhYkJhclRvUGFuZShwYW5lOiBhdG9tJFBhbmUpOiBib29sZWFuIHtcbiAgICBjb25zdCBpdGVtcyA9IHBhbmUuZ2V0SXRlbXMoKVxuICAgIGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBpdGVtID0gaXRlbXNbMF1cbiAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lVmlld01vZGVsKSB7XG4gICAgICAgIGlmIChpdGVtLmdldFRpdGxlKCkgIT09IHRoaXMuZ2V0VGl0bGUoKSB8fCBpdGVtcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhpcy5fYWRkVGFiQmFyVG9QYW5lKHBhbmUpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgLy8gRG9uJ3QgbGV0IHRoZSB1c2VyIGFkZCBhIG5vbi1kZWJ1Z2dlciBpdGVtIHRvIHRoZSBkZWJ1Z2dlciBwYW5lIGNvbnRhaW5lci4gVGhpcyBpcyBiZWNhdXNlXG4gIC8vIHRoZSBjb250YWluZXIgd2lsbCBnZXQgZGVzdHJveWVkIGJ5IHRoZSBkZWJ1Z2dlciBnb2luZyBhd2F5IG9yIHJlZG9pbmcgbGF5b3V0LCBhbmQgd2Ugd291bGRuJ3RcbiAgLy8gYmUgYWJsZSB0byBwcmVzZXJ2ZSB0aGUgdXNlcidzIG90aGVyIGl0ZW1zLlxuICBfa2lja091dE5vbkRlYnVnZ2VySXRlbXMocGFuZTogYXRvbSRQYW5lKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHBhbmUuZ2V0SXRlbXMoKSkge1xuICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwpIHtcbiAgICAgICAgaWYgKGl0ZW0gPT09IHRoaXMpIHtcbiAgICAgICAgICAvLyBJZiB0aGUgY29udGFpbmVyIGlzIGRyb3BwZWQgaW50byBpdHNlbGYsIHdlJ3ZlIGdvdCBhIHByb2JsZW0uXG4gICAgICAgICAgLy8gQ2FsbCBkZWJ1Z2dlcjpzaG93LCB3aGljaCB3aWxsIGJsb3cgYXdheSB0aGlzIGVudGlyZSBwYW5lIGFuZCByZWRvXG4gICAgICAgICAgLy8gdGhlIGRlYnVnZ2VyIGxheW91dC5cbiAgICAgICAgICAvLyBUT0RPOiBCZXR0ZXIgc29sdXRpb24gaGVyZS5cbiAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpzaG93XCIpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIGlzIGFub3RoZXIgZGVidWdnZXIgcGFuZSBjb250YWluZXIsIHdoaWNoIGNvbnRhaW5zIG90aGVyIGRlYnVnZ2VyXG4gICAgICAgICAgLy8gcGFuZXMuIE1vdmUgYWxsIHRoZSBvdGhlciBjb250YWluZXIncyBpdGVtcyB0byB0aGlzIGNvbnRhaW5lciwgYW5kXFxcbiAgICAgICAgICAvLyB0aGVuIGRlc3Ryb3kgdGhlIG90aGVyIGNvbnRhaW5lci5cbiAgICAgICAgICBjb25zdCBvdGhlclBhbmVzID0gaXRlbS5fY29udGFpbmVyLmdldFBhbmVzKClcbiAgICAgICAgICBmb3IgKGNvbnN0IG90aGVyUGFuZSBvZiBvdGhlclBhbmVzKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG90aGVySXRlbSBvZiBvdGhlclBhbmUuZ2V0SXRlbXMoKSkge1xuICAgICAgICAgICAgICBjb25zdCBpZHggPSBwYW5lLmdldEl0ZW1zKCkuaW5kZXhPZihpdGVtKVxuICAgICAgICAgICAgICBvdGhlclBhbmUubW92ZUl0ZW1Ub1BhbmUob3RoZXJJdGVtLCBwYW5lLCBpZHgpXG4gICAgICAgICAgICAgIG90aGVyUGFuZS5hY3RpdmF0ZUl0ZW1BdEluZGV4KGlkeClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBEZXN0cm95IHRoZSAobm93IGVtcHR5KSBvdGhlciBwYW5lIGNvbnRhaW5lci5cbiAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgICAgIHBhbmUuZGVzdHJveUl0ZW0oaXRlbSlcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBLaWNrIHRoZSBpdGVtIG91dCB0byB0aGUgcGFyZW50IHBhbmUuXG4gICAgICAgIGlmICghKGl0ZW0gaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVWaWV3TW9kZWwpKSB7XG4gICAgICAgICAgdGhpcy5fbW92ZUl0ZW1Ub1BhcmVudFBhbmUoaXRlbSwgcGFuZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9tb3ZlSXRlbVRvUGFyZW50UGFuZShpdGVtOiBhdG9tJFBhbmVJdGVtLCBwYW5lOiBhdG9tJFBhbmUpOiB2b2lkIHtcbiAgICBjb25zdCBwYXJlbnRQYW5lID0gdGhpcy5nZXRQYXJlbnRQYW5lKClcbiAgICBpbnZhcmlhbnQocGFyZW50UGFuZSAhPSBudWxsKVxuXG4gICAgLy8gS2ljayB0aGUgaXRlbSBvdXQgdG8gdGhlIHBhcmVudCBwYW5lLCB3aGljaCBtdXN0IGJlIGRvbmUgb24gbmV4dCB0aWNrIGJlY2F1c2UgdGhlIGRyYWdcbiAgICAvLyBvcGVyYXRpb24gY3VycmVudGx5IGluIHByb2dyZXNzIG5lZWRzIHRoZSBpdGVtIG5vdCB0byBiZSBkZXN0cm95ZWQgYmVmb3JlIHRoZSBkcmFnXG4gICAgLy8gY29tcGxldGVzLlxuICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4ge1xuICAgICAgaW52YXJpYW50KHBhcmVudFBhbmUgIT0gbnVsbClcbiAgICAgIHBhbmUubW92ZUl0ZW1Ub1BhbmUoaXRlbSwgcGFyZW50UGFuZSwgcGFyZW50UGFuZS5nZXRJdGVtcygpLmluZGV4T2YodGhpcykgKyAxKVxuXG4gICAgICAvLyBUT0RPOiBBdG9tIGJ1Zz8gVGhpcyBpcyBoZXJlIGJlY2F1c2Ugd2hlbiBzZXR0aW5nIHRoaXMgaXRlbSBhY3RpdmUgaW1tZWRpYXRlbHkgYWZ0ZXJcbiAgICAgIC8vIG1vdmluZywgaXQgc29tZXRpbWVzIChidXQgbm90IGFsd2F5cykgcmVuZGVycyBhIGJsYW5rIHBhbmUuLi5cbiAgICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4ge1xuICAgICAgICBpbnZhcmlhbnQocGFyZW50UGFuZSAhPSBudWxsKVxuICAgICAgICBwYXJlbnRQYW5lLnNldEFjdGl2ZUl0ZW0oaXRlbSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGdldFBhcmVudFBhbmUoKTogP2F0b20kUGFuZSB7XG4gICAgZm9yIChjb25zdCBwYW5lIG9mIGF0b20ud29ya3NwYWNlLmdldFBhbmVzKCkpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBwYW5lLmdldEl0ZW1zKCkpIHtcbiAgICAgICAgaWYgKGl0ZW0gPT09IHRoaXMpIHtcbiAgICAgICAgICByZXR1cm4gcGFuZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBfYWRkVGFiQmFyVG9QYW5lKHBhbmU6IGF0b20kUGFuZSk6IHZvaWQge1xuICAgIGNvbnN0IHRhYkJhclZpZXcgPSBuZXcgVGFiQmFyVmlldyhwYW5lKVxuICAgIGNvbnN0IHBhbmVFbGVtZW50ID0gYXRvbS52aWV3cy5nZXRWaWV3KHBhbmUpXG4gICAgcGFuZUVsZW1lbnQuaW5zZXJ0QmVmb3JlKHRhYkJhclZpZXcuZWxlbWVudCwgcGFuZUVsZW1lbnQuZmlyc3RDaGlsZClcblxuICAgIC8vIG1vdmVJdGVtQmV0d2VlblBhbmVzIGNvbmZsaWN0cyB3aXRoIHRoZSBwYXJlbnQgdGFiJ3MgbW92ZUl0ZW1CZXR3ZWVuUGFuZXMuXG4gICAgLy8gRW1wdHkgaXQgb3V0IHRvIGdldCB0aGUgY29ycmVjdCBiZWhhdmlvci5cbiAgICB0YWJCYXJWaWV3Lm1vdmVJdGVtQmV0d2VlblBhbmVzID0gKCkgPT4ge31cbiAgICB0YWJCYXJWaWV3LmVsZW1lbnQuY2xhc3NMaXN0LmFkZChcIm51Y2xpZGUtd29ya3NwYWNlLXZpZXdzLXBhbmVsLWxvY2F0aW9uLXRhYnNcIilcbiAgfVxuXG4gIGRpc3Bvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBkZXN0cm95KCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5fcmVtb3ZlZEZyb21MYXlvdXQpIHtcbiAgICAgIC8vIFdlIG5lZWQgdG8gZGlmZmVyZW50aWF0ZSBiZXR3ZWVuIHRoZSBjYXNlIHdoZXJlIGRlc3Ryb3lpbmcgdGhpcyBwYW5lIGhpZGVzIG9uZSBvciBtb3JlXG4gICAgICAvLyBub24tZXNzZW50aWFsIGRlYnVnZ2VyIHZpZXdzLCBhbmQgd2hlcmUgaXQgbWVhbnMgdGhlIHVzZXIgaXMgY2xvc2luZyB0aGUgZGVidWdnZXIuXG4gICAgICAvL1xuICAgICAgLy8gSWYgY2xvc2luZyB0aGlzIHBhbmUgd291bGQgY2xvc2UgYSBsaWZldGltZSB2aWV3LCBmb3J3YXJkIHRoZSBkZXN0cm95IHJlcXVlc3QgdG8gdGhhdCB2aWV3LFxuICAgICAgLy8gd2hpY2ggd2lsbCBtYW5hZ2UgdGVhcmluZyBkb3duIHRoZSBkZWJ1Z2dlci4gT3RoZXJ3aXNlLCB3ZSBhcmUgc2ltcGx5IGhpZGluZyBhbGwgcGFuZXNcbiAgICAgIC8vIGNvbnRhaW5lZCB3aXRoaW4gdGhpcyBwYW5lLCB3aGljaCBpcyBhY2NvbXBsaXNoZWQgYnkgZGlzcG9zaW5nIHRoaXMuXG4gICAgICBmb3IgKGNvbnN0IHBhbmUgb2YgdGhpcy5fY29udGFpbmVyLmdldFBhbmVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHBhbmUuZ2V0SXRlbXMoKSkge1xuICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lVmlld01vZGVsKSB7XG4gICAgICAgICAgICBpZiAoaXRlbS5pc0xpZmV0aW1lVmlldygpKSB7XG4gICAgICAgICAgICAgIGl0ZW0uZGVzdHJveSgpXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuZGlzcG9zZSgpXG4gIH1cblxuICBkZXN0cm95V2hlcmUoY2FsbGJhY2s6IChpdGVtOiBhdG9tJFBhbmVJdGVtKSA9PiBtaXhlZCkge1xuICAgIHRoaXMuX2ZvckVhY2hDaGlsZFBhbmVJdGVtKChpbm5lckl0ZW0sIHBhbmUpID0+IHtcbiAgICAgIGlmIChjYWxsYmFjayhpbm5lckl0ZW0pKSB7XG4gICAgICAgIHBhbmUuZGVzdHJveUl0ZW0oaW5uZXJJdGVtKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBnZXRUaXRsZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBERUJVR0dFUl9UQUJfVElUTEVcbiAgfVxuXG4gIGdldEljb25OYW1lKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFwibnVjbGljb24tZGVidWdnZXJcIlxuICB9XG5cbiAgZ2V0RGVmYXVsdExvY2F0aW9uKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OXG4gIH1cblxuICBnZXRVUkkoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJhdG9tOi8vbnVjbGlkZS9kZWJ1Z2dlci1jb250YWluZXJcIlxuICB9XG5cbiAgZ2V0UHJlZmVycmVkV2lkdGgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fcHJlZmVycmVkV2lkdGggPT0gbnVsbCA/IERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX1dJRFRIX1BYIDogdGhpcy5fcHJlZmVycmVkV2lkdGhcbiAgfVxuXG4gIGNyZWF0ZVZpZXcoKTogUmVhY3QuRWxlbWVudDxhbnk+IHtcbiAgICByZXR1cm4gPFZpZXcgaXRlbT17dGhpcy5fY29udGFpbmVyfSAvPlxuICB9XG5cbiAgc2V0UmVtb3ZlZEZyb21MYXlvdXQocmVtb3ZlZDogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuX3JlbW92ZWRGcm9tTGF5b3V0ID0gcmVtb3ZlZFxuXG4gICAgLy8gUHJvcGFnYXRlIHRoaXMgY29tbWFuZCB0byB0aGUgY2hpbGRyZW4gb2YgdGhlIHBhbmUgY29udGFpbmVyLlxuICAgIHRoaXMuX2ZvckVhY2hDaGlsZFBhbmVJdGVtKChpdGVtKSA9PiB7XG4gICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIERlYnVnZ2VyUGFuZVZpZXdNb2RlbCkge1xuICAgICAgICBpdGVtLnNldFJlbW92ZWRGcm9tTGF5b3V0KHJlbW92ZWQpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIF9mb3JFYWNoQ2hpbGRQYW5lSXRlbShjYWxsYmFjazogKGl0ZW06IGF0b20kUGFuZUl0ZW0sIHBhbmU6IGF0b20kUGFuZSkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLl9jb250YWluZXIuZ2V0UGFuZXMoKSkge1xuICAgICAgcGFuZS5nZXRJdGVtcygpLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgY2FsbGJhY2soaXRlbSwgcGFuZSlcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgZ2V0QWxsSXRlbXMoKTogQXJyYXk8YXRvbSRQYW5lSXRlbT4ge1xuICAgIGNvbnN0IGl0ZW1zID0gW11cbiAgICB0aGlzLl9mb3JFYWNoQ2hpbGRQYW5lSXRlbSgoaXRlbSkgPT4ge1xuICAgICAgaXRlbXMucHVzaChpdGVtKVxuICAgIH0pXG5cbiAgICByZXR1cm4gaXRlbXNcbiAgfVxuXG4gIHNlcmlhbGl6ZSgpOiBPYmplY3Qge1xuICAgIHJldHVybiB7fVxuICB9XG5cbiAgY29weSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuIl19