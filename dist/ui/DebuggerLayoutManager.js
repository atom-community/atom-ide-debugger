"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var React = _interopRequireWildcard(require("react"));

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _DebuggerPaneViewModel = _interopRequireDefault(require("./DebuggerPaneViewModel"));

var _DebuggerPaneContainerViewModel = _interopRequireDefault(require("./DebuggerPaneContainerViewModel"));

var _constants = require("../constants");

var _assert = _interopRequireDefault(require("assert"));

var _createPaneContainer = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-atom/create-pane-container"));

var _destroyItemWhere = require("@atom-ide-community/nuclide-commons-atom/destroyItemWhere");

var _DebuggerControlsView = _interopRequireDefault(require("./DebuggerControlsView"));

var _DebuggerProcessTreeView = _interopRequireDefault(require("./DebuggerProcessTreeView"));

var _BreakpointsView = _interopRequireDefault(require("./BreakpointsView"));

var _ScopesView = _interopRequireDefault(require("./ScopesView"));

var _WatchView = _interopRequireDefault(require("./WatchView"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/* global localStorage */
// Debugger views
const CONSOLE_VIEW_URI = "atom://nuclide/console";
const DEBUGGER_URI_BASE = "atom://nuclide/debugger-";

class DebuggerLayoutManager {
  constructor(service, state) {
    this._disposables = void 0;
    this._service = void 0;
    this._debuggerPanes = void 0;
    this._previousDebuggerMode = void 0;
    this._paneHiddenWarningShown = void 0;
    this._leftPaneContainerModel = void 0;
    this._rightPaneContainerModel = void 0;
    this._debuggerVisible = void 0;
    this._disposables = new _UniversalDisposable.default();
    this._service = service;
    this._previousDebuggerMode = _constants.DebuggerMode.STOPPED;
    this._paneHiddenWarningShown = false;
    this._leftPaneContainerModel = null;
    this._rightPaneContainerModel = null;
    this._debuggerVisible = false;

    this._initializeDebuggerPanes();

    this._reshowDebuggerPanes(state);

    this._disposables.add(() => {
      if (this._leftPaneContainerModel != null) {
        this._leftPaneContainerModel.dispose();
      }

      if (this._rightPaneContainerModel != null) {
        this._rightPaneContainerModel.dispose();
      }
    });
  }

  dispose() {
    this._disposables.dispose();
  }

  registerContextMenus() {
    // Add context menus to let the user restore hidden panes.
    this._debuggerPanes.forEach(pane => {
      const command = `debugger:show-window-${pane.title().replace(/ /g, "-")}`;

      this._disposables.add(atom.commands.add("atom-workspace", {
        [String(command)]: () => this.showHiddenDebuggerPane(pane.uri)
      }));

      this._disposables.add(atom.contextMenu.add({
        ".debugger-container": [{
          label: "Debugger Views",
          submenu: [{
            label: `Show ${pane.title()} window`,
            command,
            shouldDisplay: event => {
              const debuggerPane = this._debuggerPanes.find(p => p.uri === pane.uri);

              if (debuggerPane != null && (debuggerPane.isEnabled == null || debuggerPane.isEnabled())) {
                return debuggerPane.previousLocation != null && debuggerPane.previousLocation.userHidden;
              }

              return false;
            }
          }]
        }]
      }));
    });
  }

  _overridePaneInitialHeight(dockPane, newFlexScale, desiredHeight) {
    (0, _assert.default)(dockPane.element != null);

    if (newFlexScale === 1) {
      // newFlexScale === 1 when the pane is added the first time.
      // $FlowFixMe
      dockPane.element.style["flex-grow"] = "0"; // $FlowFixMe

      dockPane.element.style["flex-basis"] = "auto"; // $FlowFixMe

      dockPane.element.style["overflow-y"] = "scroll"; // $FlowFixMe

      dockPane.element.style["min-height"] = String(desiredHeight) + "px";
    } else {
      // Otherwise, the user must have resized the pane. Remove the override styles
      // and let it behave normally, the user is in control of the layout now.
      // $FlowFixMe
      dockPane.element.style["min-height"] = "0px"; // $FlowFixMe

      dockPane.element.style["flex-basis"] = "";
    }
  }

  _initializeDebuggerPanes() {
    // This configures the debugger panes. By default, they'll appear below the stepping
    // controls from top to bottom in the order they're defined here. After that, the
    // user is free to move them around.
    this._debuggerPanes = [{
      uri: DEBUGGER_URI_BASE + "controls",
      isLifetimeView: true,
      title: () => "Debugger",
      defaultLocation: _constants.DEBUGGER_PANELS_DEFAULT_LOCATION,
      isEnabled: () => true,
      createView: () => /*#__PURE__*/React.createElement(_DebuggerControlsView.default, {
        service: this._service
      }),
      onPaneResize: (dockPane, newFlexScale) => {
        this._overridePaneInitialHeight(dockPane, newFlexScale, 135); // If newFlexScale !== 1, that means the user must have resized this pane.
        // Return true to unhook this callback and let the pane resize per Atom's
        // default behavior. The user is now responsible for the pane's height.


        return newFlexScale !== 1;
      }
    }, {
      uri: DEBUGGER_URI_BASE + "debuggertree",
      isLifetimeView: false,
      defaultLocation: _constants.DEBUGGER_PANELS_DEFAULT_LOCATION,
      title: () => "Processes",
      isEnabled: () => true,
      createView: () => /*#__PURE__*/React.createElement(_DebuggerProcessTreeView.default, {
        service: this._service
      }),
      debuggerModeFilter: mode => mode !== _constants.DebuggerMode.STOPPED
    }, {
      uri: DEBUGGER_URI_BASE + "breakpoints",
      isLifetimeView: false,
      defaultLocation: _constants.DEBUGGER_PANELS_DEFAULT_LOCATION,
      title: () => "Breakpoints",
      isEnabled: () => true,
      createView: () => /*#__PURE__*/React.createElement(_BreakpointsView.default, {
        service: this._service
      })
    }, {
      uri: DEBUGGER_URI_BASE + "scopes",
      isLifetimeView: false,
      defaultLocation: _constants.DEBUGGER_PANELS_DEFAULT_LOCATION,
      title: () => "Scopes",
      isEnabled: () => true,
      createView: () => /*#__PURE__*/React.createElement(_ScopesView.default, {
        service: this._service
      }),
      debuggerModeFilter: mode => mode !== _constants.DebuggerMode.STOPPED
    }, {
      uri: DEBUGGER_URI_BASE + "watch-expressions",
      isLifetimeView: false,
      defaultLocation: "bottom",
      previousDefaultLocation: _constants.DEBUGGER_PANELS_DEFAULT_LOCATION,
      title: () => "Watch Expressions",
      isEnabled: () => true,
      createView: () => /*#__PURE__*/React.createElement(_WatchView.default, {
        service: this._service
      })
    }];
    this.registerContextMenus();

    this._restoreDebuggerPaneLocations();
  }

  _reshowDebuggerPanes(state) {
    if (state && state.showDebugger) {
      this.showDebuggerViews();

      this._getWorkspaceDocks().forEach((dock, index) => {
        if (dock.dock.isVisible != null && state.workspaceDocksVisibility != null && !state.workspaceDocksVisibility[index] && dock.dock.isVisible() && dock.dock.hide != null) {
          dock.dock.hide();
        }
      }); // Hiding the docks might have changed the visibility of the debugger
      // if the only docks containing debugger panes are now hidden.


      this._updateDebuggerVisibility();
    }
  }

  _updateDebuggerVisibility() {
    this._debuggerVisible = false; // See if any visible docks contain a pane that contains a debugger pane.

    this._getWorkspaceDocks().forEach(dock => {
      if (dock.dock.isVisible != null && dock.dock.isVisible()) {
        dock.dock.getPanes().forEach(pane => {
          if (pane.getItems().find(item => item instanceof _DebuggerPaneViewModel.default || item instanceof _DebuggerPaneContainerViewModel.default) != null) {
            this._debuggerVisible = true;
          }
        });
      }
    });
  }

  showHiddenDebuggerPane(uri) {
    const pane = this._debuggerPanes.find(p => p.uri === uri);

    if (pane != null && pane.previousLocation != null) {
      pane.previousLocation.userHidden = false;
    }

    this.showDebuggerViews();
  }

  getModelForDebuggerUri(uri) {
    const config = this._debuggerPanes.find(pane => pane.uri === uri);

    if (config != null) {
      return new _DebuggerPaneViewModel.default(config, config.isLifetimeView, pane => this._paneDestroyed(pane));
    }

    return null;
  }

  _getWorkspaceDocks() {
    const docks = new Array(4);
    (0, _assert.default)(atom.workspace.getLeftDock != null);
    docks[0] = {
      name: "left",
      dock: atom.workspace.getLeftDock(),
      orientation: "vertical"
    };
    (0, _assert.default)(atom.workspace.getBottomDock != null);
    docks[1] = {
      name: "bottom",
      dock: atom.workspace.getBottomDock(),
      orientation: "horizontal"
    };
    (0, _assert.default)(atom.workspace.getCenter != null);
    docks[2] = {
      name: "center",
      dock: atom.workspace.getCenter(),
      orientation: "horizontal"
    };
    (0, _assert.default)(atom.workspace.getRightDock != null);
    docks[3] = {
      name: "right",
      dock: atom.workspace.getRightDock(),
      orientation: "vertical"
    };
    return docks;
  }

  _isDockEmpty(dock) {
    const panes = dock.getPanes(); // A dock is empty for our purposes if it has nothing visible in it. If a dock
    // with no items is left open, Atom implicitly adds a single pane with no items
    // in it, so check for no panes, or a single pane with no items.

    return panes.length === 0 || panes.length === 1 && panes[0].getItems().length === 0;
  }

  _appendItemToDock(paneConfig, dock, item, debuggerItemsPerDock) {
    const panes = dock.getPanes();
    (0, _assert.default)(panes.length >= 1);
    const dockPane = panes[panes.length - 1];

    if (this._isDockEmpty(dock)) {
      dockPane.addItem(item);
    } else {
      let dockConfig = this._getWorkspaceDocks().find(d => d.dock === dock);

      if (dockConfig == null) {
        // This item is being added to a nested PaneContainer rather than
        // directly to a dock. This is only done for vertical layouts.
        dockConfig = {
          orientation: "vertical"
        };
      }

      if (dockConfig.orientation === "horizontal") {
        // Add the item as a new tab in the existing pane to the right of the current active pane for the dock.
        dockPane.addItem(item);

        try {
          dockPane.activateItem(item);
        } catch (e) {// During testing, I saw some cases where Atom threw trying to activate an item
          // that was still in progress of being added. This was tested on a Beta release
          // and may indicate a temporary bug. However, there is no reason to throw here
          // and stop laying out the debugger if an item could not be set as active.
        }
      } else {
        // When adding to a vertical dock that is not empty, but contains no debugger
        // items, add the debugger pane container as a new tab item. Otherwise, append
        // downward.
        if (debuggerItemsPerDock.get(dock) == null) {
          dockPane.addItem(item);
          dockPane.activateItem(item);
        } else {
          dockPane.splitDown({
            items: [item]
          });
        }
      }
    } // Keep track of which dock(s) we've appended debugger panes into. This
    // allows us to quickly check if the dock needs to be split to separate
    // debugger panes and pre-existing panes that have nothing to do with
    // the debugger.


    if (debuggerItemsPerDock.get(dock) == null) {
      debuggerItemsPerDock.set(dock, 1);
    } else {
      const itemCount = debuggerItemsPerDock.get(dock);
      debuggerItemsPerDock.set(dock, itemCount + 1);
    }

    if (dock.isVisible != null && dock.show != null && !dock.isVisible()) {
      dock.show();
    } // If the debugger pane config has a custom layout callback, hook it up now.


    if (paneConfig != null && paneConfig.onPaneResize != null) {
      const disposables = new _UniversalDisposable.default();
      disposables.add(dockPane.onWillDestroy(() => disposables.dispose()));
      disposables.add(dockPane.onDidChangeFlexScale(newFlexScale => {
        (0, _assert.default)(paneConfig.onPaneResize != null);

        if (paneConfig.onPaneResize(dockPane, newFlexScale)) {
          // The callback has requested to be unregistered.
          disposables.dispose();
        }
      }));
    }
  }

  resetLayout() {
    // Remove all debugger panes from the UI.
    this.hideDebuggerViews(false); // Forget all their previous locations.

    for (const debuggerPane of this._debuggerPanes) {
      debuggerPane.previousLocation = null;

      const key = this._getPaneStorageKey(debuggerPane.uri);

      localStorage.setItem(key, "");
    } // Forget all previous dock sizes;


    for (const dockInfo of this._getWorkspaceDocks()) {
      const {
        name
      } = dockInfo;

      const key = this._getPaneStorageKey("dock-size" + name);

      localStorage.removeItem(key);
    } // Pop the debugger open with the default layout.


    this._debuggerPanes = [];
    this._paneHiddenWarningShown = false;

    this._initializeDebuggerPanes();

    this.showDebuggerViews();
  }

  _getPaneStorageKey(uri) {
    return "debugger-pane-location-" + uri;
  }

  _deserializeSavedLocation(savedItem) {
    try {
      const obj = JSON.parse(savedItem);

      if (obj != null && obj.dock != null && obj.layoutIndex != null && obj.userHidden != null) {
        return obj;
      }
    } catch (e) {}

    return null;
  }

  _restoreDebuggerPaneLocations() {
    // See if there are saved previous locations for the debugger panes.
    for (const debuggerPane of this._debuggerPanes) {
      const savedItem = localStorage.getItem(this._getPaneStorageKey(debuggerPane.uri));

      if (savedItem != null) {
        debuggerPane.previousLocation = this._deserializeSavedLocation(savedItem);
      }
    }
  }

  _saveDebuggerPaneLocations() {
    for (const dockInfo of this._getWorkspaceDocks()) {
      const {
        name,
        dock
      } = dockInfo;
      const panes = dock.getPanes();
      let layoutIndex = 0;
      let dockContainsDebuggerItem = false;

      for (const pane of panes) {
        for (const item of pane.getItems()) {
          const paneItems = [];

          if (item instanceof _DebuggerPaneContainerViewModel.default) {
            paneItems.push(...item.getAllItems());
          } else {
            paneItems.push(item);
          }

          for (const itemToSave of paneItems) {
            if (itemToSave instanceof _DebuggerPaneViewModel.default) {
              const location = {
                dock: name,
                layoutIndex,
                userHidden: false
              };
              dockContainsDebuggerItem = true;
              itemToSave.getConfig().previousLocation = location;
              layoutIndex++;
            }
          }
        }
      }

      const key = this._getPaneStorageKey("dock-size" + name);

      if (dockContainsDebuggerItem && dock.state != null) {
        // Save the size of a dock only if it contains a debugger item.
        const sizeInfo = JSON.stringify(dock.state.size);
        localStorage.setItem(key, sizeInfo);
      } else {
        localStorage.removeItem(key);
      }
    } // Serialize to storage.


    for (const debuggerPane of this._debuggerPanes) {
      const key = this._getPaneStorageKey(debuggerPane.uri); // If the location is the pane's default location, no need to store
      // it explicitly. This is also helpful if the default changes in the
      // future.


      if (debuggerPane.previousLocation != null && !debuggerPane.previousLocation.userHidden && (debuggerPane.previousLocation.dock === debuggerPane.defaultLocation || debuggerPane.previousLocation.dock === debuggerPane.previousDefaultLocation && !debuggerPane.previousLocation.userCustomized)) {
        localStorage.removeItem(key);
      } else {
        if (debuggerPane.previousLocation != null) {
          debuggerPane.previousLocation.userCustomized = true;
        }

        const loc = JSON.stringify(debuggerPane.previousLocation);
        localStorage.setItem(key, loc);
      }
    }
  }

  _shouldDestroyPaneItem(mode, item) {
    if (item instanceof _DebuggerPaneViewModel.default) {
      const config = item.getConfig();

      if (config.debuggerModeFilter != null && !config.debuggerModeFilter(mode)) {
        item.setRemovedFromLayout(true);
        return true;
      }
    }

    return false;
  }

  debuggerModeChanged() {
    const mode = this._getFocusedProcessMode(); // Most panes disappear when the debugger is stopped, only keep
    // the ones that should still be shown.


    if (mode === _constants.DebuggerMode.STOPPING && this._previousDebuggerMode !== _constants.DebuggerMode.STOPPED) {
      this._saveDebuggerPaneLocations();
    } else if (mode === _constants.DebuggerMode.STOPPED) {
      (0, _destroyItemWhere.destroyItemWhere)(item => {
        if (item instanceof _DebuggerPaneContainerViewModel.default) {
          // Forward the destruction logic to the contianer.
          item.destroyWhere(innerItem => this._shouldDestroyPaneItem(mode, innerItem));

          this._destroyContainerIfEmpty(item);

          return false;
        }

        return this._shouldDestroyPaneItem(mode, item);
      });
    }

    this._previousDebuggerMode = mode;
  }

  _countPanesForTargetDock(dockName, defaultDockName) {
    const mode = this._getFocusedProcessMode();

    return this._debuggerPanes.filter( // Filter out any panes that the user has hidden or that aren't visible
    // in the current debug mode.
    debuggerPane => (debuggerPane.previousLocation == null || !debuggerPane.previousLocation.userHidden) && (debuggerPane.debuggerModeFilter == null || debuggerPane.debuggerModeFilter(mode))).map(debuggerPane => {
      // Map each debugger pane to the name of the dock it will belong to.
      if (debuggerPane.previousLocation != null) {
        const previousDock = this._getWorkspaceDocks().find(d => debuggerPane.previousLocation != null && d.name === debuggerPane.previousLocation.dock);

        if (previousDock != null) {
          return previousDock.name;
        }
      }

      return defaultDockName;
    }).filter(targetDockName => targetDockName === dockName).length;
  }

  _getSavedDebuggerPaneSize(dock) {
    const key = this._getPaneStorageKey("dock-size" + dock.name);

    const savedItem = localStorage.getItem(key);

    if (savedItem != null) {
      const sizeInfo = JSON.parse(savedItem);

      if (!Number.isNaN(sizeInfo)) {
        return sizeInfo;
      }
    }

    return null;
  }

  showDebuggerViews() {
    // Hide any debugger panes other than the controls so we have a known
    // starting point for preparing the layout.
    this.hideDebuggerViews(true);
    const addedItemsByDock = new Map();

    const defaultDock = this._getWorkspaceDocks().find(d => d.name === _constants.DEBUGGER_PANELS_DEFAULT_LOCATION);

    (0, _assert.default)(defaultDock != null);

    const leftDock = this._getWorkspaceDocks().find(d => d.name === "left");

    (0, _assert.default)(leftDock != null);
    let leftPaneContainer = null;

    if (this._countPanesForTargetDock(leftDock.name, defaultDock.name) > 0) {
      leftPaneContainer = (0, _createPaneContainer.default)();

      const size = this._getSavedDebuggerPaneSize(leftDock);

      this._leftPaneContainerModel = this._addPaneContainerToWorkspace(leftPaneContainer, leftDock.dock, addedItemsByDock, size);
    }

    const rightDock = this._getWorkspaceDocks().find(d => d.name === "right");

    (0, _assert.default)(rightDock != null);
    let rightPaneContainer = null;

    if (this._countPanesForTargetDock(rightDock.name, defaultDock.name) > 0) {
      rightPaneContainer = (0, _createPaneContainer.default)();

      const size = this._getSavedDebuggerPaneSize(rightDock);

      this._rightPaneContainerModel = this._addPaneContainerToWorkspace(rightPaneContainer, rightDock.dock, addedItemsByDock, size);
    } // Lay out the remaining debugger panes according to their configurations.
    // Sort the debugger panes by the index at which they appeared the last
    // time they were positioned, so we maintain the relative ordering of
    // debugger panes within the same dock.


    const mode = this._getFocusedProcessMode();

    this._debuggerPanes.slice().sort((a, b) => {
      const aPos = a.previousLocation == null ? 0 : a.previousLocation.layoutIndex;
      const bPos = b.previousLocation == null ? 0 : b.previousLocation.layoutIndex;
      return aPos - bPos;
    }).filter(debuggerPane => (debuggerPane.isEnabled == null || debuggerPane.isEnabled()) && (debuggerPane.previousLocation == null || !debuggerPane.previousLocation.userHidden)).forEach(debuggerPane => {
      let targetDock = defaultDock; // If this pane had a previous location, restore to the previous dock.

      const loc = debuggerPane.previousLocation != null ? debuggerPane.previousLocation.dock : debuggerPane.defaultLocation;

      const previousDock = this._getWorkspaceDocks().find(d => d.name === loc);

      if (previousDock != null) {
        targetDock = previousDock;
      } // Render to a nested pane container for the two vertical docks
      // rather than adding the item directly to the dock itself.


      let targetContainer = targetDock.dock;

      if (targetDock.name === "left") {
        targetContainer = leftPaneContainer;
      } else if (targetDock.name === "right") {
        targetContainer = rightPaneContainer;
      }

      if (debuggerPane.debuggerModeFilter == null || debuggerPane.debuggerModeFilter(mode)) {
        (0, _assert.default)(targetContainer != null);

        const size = this._getSavedDebuggerPaneSize(targetDock);

        this._appendItemToDock(debuggerPane, targetContainer, new _DebuggerPaneViewModel.default(debuggerPane, debuggerPane.isLifetimeView, pane => this._paneDestroyed(pane), size), addedItemsByDock);
      }
    });

    this._debuggerVisible = true; // Re-focus the console pane after layout so that it remains visible
    // even if we added debugger panes to the console's dock.
    // eslint-disable-next-line nuclide-internal/atom-apis

    atom.workspace.open(CONSOLE_VIEW_URI, {
      searchAllPanes: true
    });
  }

  _addPaneContainerToWorkspace(container, dock, addedItemsByDock, dockSize) {
    const containerModel = new _DebuggerPaneContainerViewModel.default(container, dockSize);

    this._appendItemToDock(null, dock, containerModel, addedItemsByDock);

    return containerModel;
  }

  _getFocusedProcessMode() {
    const {
      viewModel
    } = this._service;
    return viewModel.focusedProcess == null ? _constants.DebuggerMode.STOPPED : viewModel.focusedProcess.debuggerMode;
  }

  _paneDestroyed(pane) {
    if (pane.isLifetimeView) {
      // Lifetime views are not hidden and remembered like the unimportant views.
      // This view being destroyed means the debugger is exiting completely, and
      // this view is never remembered as "hidden by the user" because it's reqiured
      // for running the debugger.
      const mode = this._getFocusedProcessMode();

      if (mode === _constants.DebuggerMode.RUNNING || mode === _constants.DebuggerMode.PAUSED) {
        this._saveDebuggerPaneLocations();
      }

      this.hideDebuggerViews(false);

      for (const process of this._service.getModel().getProcesses()) {
        this._service.stopProcess(process);
      }

      return;
    } // Views can be selectively hidden by the user while the debugger is
    // running and that preference should be remembered.


    const config = this._debuggerPanes.find(p => p.uri === pane.uri);

    (0, _assert.default)(config != null);

    if (config.previousLocation == null) {
      config.previousLocation = {
        dock: "",
        layoutIndex: 0,
        userHidden: false
      };
    }

    if (config.isEnabled == null || config.isEnabled()) {
      const mode = this._getFocusedProcessMode();

      if (config.debuggerModeFilter == null || config.debuggerModeFilter(mode)) {
        (0, _assert.default)(config.previousLocation != null);
        config.previousLocation.userHidden = true; // Show a notification telling the user how to get the pane back
        // only once per session.

        if (!this._paneHiddenWarningShown) {
          this._paneHiddenWarningShown = true;
          atom.notifications.addInfo(`${config.title()} has been hidden. Right click any Debugger pane to bring it back.`);
        }
      }
    } // If hiding this view left an empty debugger pane container, destroy the container.


    this._destroyContainerIfEmpty(this._leftPaneContainerModel);

    this._destroyContainerIfEmpty(this._rightPaneContainerModel);
  }

  _destroyContainerIfEmpty(container) {
    if (container != null && container.getAllItems().length === 0) {
      const parent = container.getParentPane();

      if (parent != null) {
        parent.removeItem(container);
        container.destroy();
      }
    }
  }

  hideDebuggerViews(performingLayout) {
    // Docks do not toggle closed automatically when we remove all their items.
    // They can contain things other than the debugger items though, and could
    // have been left open and empty by the user. Toggle closed any docks that
    // end up empty only as a result of closing the debugger.
    const docks = this._getWorkspaceDocks();

    const previouslyEmpty = docks.map(dock => this._isDockEmpty(dock.dock)); // Find and destroy all debugger items, and the panes that contained them.

    atom.workspace.getPanes().forEach(pane => {
      pane.getItems().forEach(item => {
        if (item instanceof _DebuggerPaneViewModel.default || item instanceof _DebuggerPaneContainerViewModel.default) {
          // Remove the view model.
          item.setRemovedFromLayout(true);
          pane.destroyItem(item); // If removing the model left an empty pane, remove the pane.

          if (pane.getItems().length === 0) {
            pane.destroy();
          }
        }
      });
    }); // If any docks became empty as a result of closing those panes, hide the dock.

    if (!performingLayout) {
      docks.map(dock => this._isDockEmpty(dock.dock)).forEach((empty, index) => {
        if (empty && !previouslyEmpty[index]) {
          docks[index].dock.hide();
        }
      });
    }

    if (this._leftPaneContainerModel != null) {
      this._leftPaneContainerModel.setRemovedFromLayout(true);

      (0, _assert.default)(this._leftPaneContainerModel != null);

      this._leftPaneContainerModel.dispose();

      this._leftPaneContainerModel = null;
    }

    if (this._rightPaneContainerModel != null) {
      this._rightPaneContainerModel.setRemovedFromLayout(true);

      (0, _assert.default)(this._rightPaneContainerModel != null);

      this._rightPaneContainerModel.dispose();

      this._rightPaneContainerModel = null;
    }

    this._debuggerVisible = false;
  }

  isDebuggerVisible() {
    return this._debuggerVisible;
  }

  getWorkspaceDocksVisibility() {
    this._saveDebuggerPaneLocations();

    return this._getWorkspaceDocks().map(dock => {
      return dock.dock.isVisible != null && dock.dock.isVisible();
    });
  }

}

exports.default = DebuggerLayoutManager;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyTGF5b3V0TWFuYWdlci5qcyJdLCJuYW1lcyI6WyJDT05TT0xFX1ZJRVdfVVJJIiwiREVCVUdHRVJfVVJJX0JBU0UiLCJEZWJ1Z2dlckxheW91dE1hbmFnZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZpY2UiLCJzdGF0ZSIsIl9kaXNwb3NhYmxlcyIsIl9zZXJ2aWNlIiwiX2RlYnVnZ2VyUGFuZXMiLCJfcHJldmlvdXNEZWJ1Z2dlck1vZGUiLCJfcGFuZUhpZGRlbldhcm5pbmdTaG93biIsIl9sZWZ0UGFuZUNvbnRhaW5lck1vZGVsIiwiX3JpZ2h0UGFuZUNvbnRhaW5lck1vZGVsIiwiX2RlYnVnZ2VyVmlzaWJsZSIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJEZWJ1Z2dlck1vZGUiLCJTVE9QUEVEIiwiX2luaXRpYWxpemVEZWJ1Z2dlclBhbmVzIiwiX3Jlc2hvd0RlYnVnZ2VyUGFuZXMiLCJhZGQiLCJkaXNwb3NlIiwicmVnaXN0ZXJDb250ZXh0TWVudXMiLCJmb3JFYWNoIiwicGFuZSIsImNvbW1hbmQiLCJ0aXRsZSIsInJlcGxhY2UiLCJhdG9tIiwiY29tbWFuZHMiLCJTdHJpbmciLCJzaG93SGlkZGVuRGVidWdnZXJQYW5lIiwidXJpIiwiY29udGV4dE1lbnUiLCJsYWJlbCIsInN1Ym1lbnUiLCJzaG91bGREaXNwbGF5IiwiZXZlbnQiLCJkZWJ1Z2dlclBhbmUiLCJmaW5kIiwicCIsImlzRW5hYmxlZCIsInByZXZpb3VzTG9jYXRpb24iLCJ1c2VySGlkZGVuIiwiX292ZXJyaWRlUGFuZUluaXRpYWxIZWlnaHQiLCJkb2NrUGFuZSIsIm5ld0ZsZXhTY2FsZSIsImRlc2lyZWRIZWlnaHQiLCJlbGVtZW50Iiwic3R5bGUiLCJpc0xpZmV0aW1lVmlldyIsImRlZmF1bHRMb2NhdGlvbiIsIkRFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OIiwiY3JlYXRlVmlldyIsIm9uUGFuZVJlc2l6ZSIsImRlYnVnZ2VyTW9kZUZpbHRlciIsIm1vZGUiLCJwcmV2aW91c0RlZmF1bHRMb2NhdGlvbiIsIl9yZXN0b3JlRGVidWdnZXJQYW5lTG9jYXRpb25zIiwic2hvd0RlYnVnZ2VyIiwic2hvd0RlYnVnZ2VyVmlld3MiLCJfZ2V0V29ya3NwYWNlRG9ja3MiLCJkb2NrIiwiaW5kZXgiLCJpc1Zpc2libGUiLCJ3b3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiLCJoaWRlIiwiX3VwZGF0ZURlYnVnZ2VyVmlzaWJpbGl0eSIsImdldFBhbmVzIiwiZ2V0SXRlbXMiLCJpdGVtIiwiRGVidWdnZXJQYW5lVmlld01vZGVsIiwiRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsIiwiZ2V0TW9kZWxGb3JEZWJ1Z2dlclVyaSIsImNvbmZpZyIsIl9wYW5lRGVzdHJveWVkIiwiZG9ja3MiLCJBcnJheSIsIndvcmtzcGFjZSIsImdldExlZnREb2NrIiwibmFtZSIsIm9yaWVudGF0aW9uIiwiZ2V0Qm90dG9tRG9jayIsImdldENlbnRlciIsImdldFJpZ2h0RG9jayIsIl9pc0RvY2tFbXB0eSIsInBhbmVzIiwibGVuZ3RoIiwiX2FwcGVuZEl0ZW1Ub0RvY2siLCJwYW5lQ29uZmlnIiwiZGVidWdnZXJJdGVtc1BlckRvY2siLCJhZGRJdGVtIiwiZG9ja0NvbmZpZyIsImQiLCJhY3RpdmF0ZUl0ZW0iLCJlIiwiZ2V0Iiwic3BsaXREb3duIiwiaXRlbXMiLCJzZXQiLCJpdGVtQ291bnQiLCJzaG93IiwiZGlzcG9zYWJsZXMiLCJvbldpbGxEZXN0cm95Iiwib25EaWRDaGFuZ2VGbGV4U2NhbGUiLCJyZXNldExheW91dCIsImhpZGVEZWJ1Z2dlclZpZXdzIiwia2V5IiwiX2dldFBhbmVTdG9yYWdlS2V5IiwibG9jYWxTdG9yYWdlIiwic2V0SXRlbSIsImRvY2tJbmZvIiwicmVtb3ZlSXRlbSIsIl9kZXNlcmlhbGl6ZVNhdmVkTG9jYXRpb24iLCJzYXZlZEl0ZW0iLCJvYmoiLCJKU09OIiwicGFyc2UiLCJsYXlvdXRJbmRleCIsImdldEl0ZW0iLCJfc2F2ZURlYnVnZ2VyUGFuZUxvY2F0aW9ucyIsImRvY2tDb250YWluc0RlYnVnZ2VySXRlbSIsInBhbmVJdGVtcyIsInB1c2giLCJnZXRBbGxJdGVtcyIsIml0ZW1Ub1NhdmUiLCJsb2NhdGlvbiIsImdldENvbmZpZyIsInNpemVJbmZvIiwic3RyaW5naWZ5Iiwic2l6ZSIsInVzZXJDdXN0b21pemVkIiwibG9jIiwiX3Nob3VsZERlc3Ryb3lQYW5lSXRlbSIsInNldFJlbW92ZWRGcm9tTGF5b3V0IiwiZGVidWdnZXJNb2RlQ2hhbmdlZCIsIl9nZXRGb2N1c2VkUHJvY2Vzc01vZGUiLCJTVE9QUElORyIsImRlc3Ryb3lXaGVyZSIsImlubmVySXRlbSIsIl9kZXN0cm95Q29udGFpbmVySWZFbXB0eSIsIl9jb3VudFBhbmVzRm9yVGFyZ2V0RG9jayIsImRvY2tOYW1lIiwiZGVmYXVsdERvY2tOYW1lIiwiZmlsdGVyIiwibWFwIiwicHJldmlvdXNEb2NrIiwidGFyZ2V0RG9ja05hbWUiLCJfZ2V0U2F2ZWREZWJ1Z2dlclBhbmVTaXplIiwiTnVtYmVyIiwiaXNOYU4iLCJhZGRlZEl0ZW1zQnlEb2NrIiwiTWFwIiwiZGVmYXVsdERvY2siLCJsZWZ0RG9jayIsImxlZnRQYW5lQ29udGFpbmVyIiwiX2FkZFBhbmVDb250YWluZXJUb1dvcmtzcGFjZSIsInJpZ2h0RG9jayIsInJpZ2h0UGFuZUNvbnRhaW5lciIsInNsaWNlIiwic29ydCIsImEiLCJiIiwiYVBvcyIsImJQb3MiLCJ0YXJnZXREb2NrIiwidGFyZ2V0Q29udGFpbmVyIiwib3BlbiIsInNlYXJjaEFsbFBhbmVzIiwiY29udGFpbmVyIiwiZG9ja1NpemUiLCJjb250YWluZXJNb2RlbCIsInZpZXdNb2RlbCIsImZvY3VzZWRQcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiUlVOTklORyIsIlBBVVNFRCIsInByb2Nlc3MiLCJnZXRNb2RlbCIsImdldFByb2Nlc3NlcyIsInN0b3BQcm9jZXNzIiwibm90aWZpY2F0aW9ucyIsImFkZEluZm8iLCJwYXJlbnQiLCJnZXRQYXJlbnRQYW5lIiwiZGVzdHJveSIsInBlcmZvcm1pbmdMYXlvdXQiLCJwcmV2aW91c2x5RW1wdHkiLCJkZXN0cm95SXRlbSIsImVtcHR5IiwiaXNEZWJ1Z2dlclZpc2libGUiLCJnZXRXb3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFsQkE7QUFhQTtBQU9BLE1BQU1BLGdCQUFnQixHQUFHLHdCQUF6QjtBQUNBLE1BQU1DLGlCQUFpQixHQUFHLDBCQUExQjs7QUFpRGUsTUFBTUMscUJBQU4sQ0FBNEI7QUFVekNDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUF5QkMsS0FBekIsRUFBa0Q7QUFBQSxTQVQ3REMsWUFTNkQ7QUFBQSxTQVI3REMsUUFRNkQ7QUFBQSxTQVA3REMsY0FPNkQ7QUFBQSxTQU43REMscUJBTTZEO0FBQUEsU0FMN0RDLHVCQUs2RDtBQUFBLFNBSjdEQyx1QkFJNkQ7QUFBQSxTQUg3REMsd0JBRzZEO0FBQUEsU0FGN0RDLGdCQUU2RDtBQUMzRCxTQUFLUCxZQUFMLEdBQW9CLElBQUlRLDRCQUFKLEVBQXBCO0FBQ0EsU0FBS1AsUUFBTCxHQUFnQkgsT0FBaEI7QUFDQSxTQUFLSyxxQkFBTCxHQUE2Qk0sd0JBQWFDLE9BQTFDO0FBQ0EsU0FBS04sdUJBQUwsR0FBK0IsS0FBL0I7QUFDQSxTQUFLQyx1QkFBTCxHQUErQixJQUEvQjtBQUNBLFNBQUtDLHdCQUFMLEdBQWdDLElBQWhDO0FBQ0EsU0FBS0MsZ0JBQUwsR0FBd0IsS0FBeEI7O0FBQ0EsU0FBS0ksd0JBQUw7O0FBQ0EsU0FBS0Msb0JBQUwsQ0FBMEJiLEtBQTFCOztBQUVBLFNBQUtDLFlBQUwsQ0FBa0JhLEdBQWxCLENBQXNCLE1BQU07QUFDMUIsVUFBSSxLQUFLUix1QkFBTCxJQUFnQyxJQUFwQyxFQUEwQztBQUN4QyxhQUFLQSx1QkFBTCxDQUE2QlMsT0FBN0I7QUFD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TDs7QUFDQSxXQUFPLEtBQUszRCxrQkFBTCxHQUEwQm9GLEdBQTFCLENBQStCbkYsSUFBRCxJQUFVO0FBQzdDLGFBQU9BLElBQUksQ0FBQ0EsSUFBTCxDQUFVRSxTQUFWLElBQXVCLElBQXZCLElBQStCRixJQUFJLENBQUNBLElBQUwsQ0FBVUUsU0FBVixFQUF0QztBQUNELEtBRk0sQ0FBUDtBQUdEOztBQXB3QndDIiwic291cmNlc0NvbnRlbnQiOlsiLyogZ2xvYmFsIGxvY2FsU3RvcmFnZSAqL1xuXG5pbXBvcnQgdHlwZSB7IERlYnVnZ2VyTW9kZVR5cGUsIElEZWJ1Z1NlcnZpY2UsIFNlcmlhbGl6ZWRTdGF0ZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgRGVidWdnZXJQYW5lVmlld01vZGVsIGZyb20gXCIuL0RlYnVnZ2VyUGFuZVZpZXdNb2RlbFwiXG5pbXBvcnQgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsIGZyb20gXCIuL0RlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbFwiXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUsIERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0IGNyZWF0ZVBhbmVDb250YWluZXIgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vY3JlYXRlLXBhbmUtY29udGFpbmVyXCJcbmltcG9ydCB7IGRlc3Ryb3lJdGVtV2hlcmUgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9kZXN0cm95SXRlbVdoZXJlXCJcblxuLy8gRGVidWdnZXIgdmlld3NcbmltcG9ydCBEZWJ1Z2dlckNvbnRyb2xzVmlldyBmcm9tIFwiLi9EZWJ1Z2dlckNvbnRyb2xzVmlld1wiXG5pbXBvcnQgRGVidWdnZXJQcm9jZXNzVHJlZVZpZXcgZnJvbSBcIi4vRGVidWdnZXJQcm9jZXNzVHJlZVZpZXdcIlxuaW1wb3J0IEJyZWFrcG9pbnRzVmlldyBmcm9tIFwiLi9CcmVha3BvaW50c1ZpZXdcIlxuaW1wb3J0IFNjb3Blc1ZpZXcgZnJvbSBcIi4vU2NvcGVzVmlld1wiXG5pbXBvcnQgV2F0Y2hWaWV3IGZyb20gXCIuL1dhdGNoVmlld1wiXG5cbmNvbnN0IENPTlNPTEVfVklFV19VUkkgPSBcImF0b206Ly9udWNsaWRlL2NvbnNvbGVcIlxuY29uc3QgREVCVUdHRVJfVVJJX0JBU0UgPSBcImF0b206Ly9udWNsaWRlL2RlYnVnZ2VyLVwiXG5cbmV4cG9ydCB0eXBlIERlYnVnZ2VyUGFuZUxvY2F0aW9uID0ge1xuICBkb2NrOiBzdHJpbmcsXG4gIGxheW91dEluZGV4OiBudW1iZXIsXG4gIHVzZXJIaWRkZW46IGJvb2xlYW4sXG4gIHVzZXJDdXN0b21pemVkPzogYm9vbGVhbixcbn1cblxuLy8gQ29uZmlndXJhdGlvbiB0aGF0IGRlZmluZXMgYSBkZWJ1Z2dlciBwYW5lLiBUaGlzIGNvbnRyb2xzIHdoYXQgZ2V0cyBhZGRlZFxuLy8gdG8gdGhlIHdvcmtzcGFjZSB3aGVuIHN0YXJ0aW5nIGRlYnVnZ2luZy5cbmV4cG9ydCB0eXBlIERlYnVnZ2VyUGFuZUNvbmZpZyA9IHtcbiAgLy8gRWFjaCBwYW5lIG11c3QgcHJvdmlkZSBhIHVuaXF1ZSBVUkkuXG4gIHVyaTogc3RyaW5nLFxuXG4gIC8vIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgdGl0bGUgZm9yIHRoZSBwYW5lLiBTb21lIHBhbmVzIChsaWtlIFRocmVhZHMpIG5lZWRcbiAgLy8gdG8gY2hhbmdlIHRoZWlyIHRpdGxlIGRlcGVuZGluZyBvbiB0aGUgZGVidWcgdGFyZ2V0IChleCBcIlRocmVhZHNcIiBmb3IgQysrIGJ1dFxuICAvLyBcIlJlcXVlc3RzXCIgZm9yIFBIUCkuXG4gIHRpdGxlOiAoKSA9PiBzdHJpbmcsXG5cbiAgLy8gT3B0aW9uYWwgZnVuY3Rpb24gdGhhdCBpbmRpY2F0ZXMgaWYgdGhlIHBhbmUgaXMgZW5hYmxlZCBmb3IgdGhlIGN1cnJlbnQgZGVidWdcbiAgLy8gc2Vzc2lvbi4gSWYgbm90IGVuYWJsZWQsIHRoZSBwYW5lIHdvbid0IGJlIGFkZGVkIHRvIHRoZSB3b3Jrc3BhY2UuXG4gIGlzRW5hYmxlZD86ICgpID0+IGJvb2xlYW4sXG5cbiAgLy8gQm9vbGVhbiBpbmRpY2F0aW5nIGlmIHRoZSBkZWJ1ZyBzZXNzaW9uIGxpZmV0aW1lIHNob3VsZCBiZSB0aWVkIHRvIHRoaXMgdmlldy5cbiAgLy8gSWYgdHJ1ZSwgdGhlIGRlYnVnIHNlc3Npb24gd2lsbCBiZSB0ZXJtaW5hdGVkIGlmIHRoaXMgdmlldyBpcyBkZXN0cm95ZWQuXG4gIGlzTGlmZXRpbWVWaWV3OiBib29sZWFuLFxuXG4gIC8vIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIHZpZXcgZm9yIEF0b20gdG8gdXNlIGZvciB0aGUgd29ya3NwYWNlIHBhbmUuXG4gIGNyZWF0ZVZpZXc6ICgpID0+IFJlYWN0LkVsZW1lbnQ8YW55PixcblxuICAvLyBPcHRpb25hbCBmaWx0ZXIgZnVuY3Rpb24gdGhhdCBsZXRzIHBhbmVzIHNwZWNpZnkgdGhhdCB0aGV5IHNob3VsZCBiZSBzaG93blxuICAvLyBvciBoaWRkZW4gZGVwZW5kaW5nIG9uIHRoZSBkZWJ1Z2dlciBtb2RlIChleCBkb24ndCBzaG93IHRocmVhZHMgd2hlbiBzdG9wcGVkKS5cbiAgZGVidWdnZXJNb2RlRmlsdGVyPzogKG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUpID0+IGJvb2xlYW4sXG5cbiAgLy8gU3RydWN0dXJlIHRvIHJlbWVtYmVyIHRoZSBwYW5lJ3MgcHJldmlvdXMgbG9jYXRpb24gaWYgdGhlIHVzZXIgbW92ZWQgaXQgYXJvdW5kLlxuICBwcmV2aW91c0xvY2F0aW9uPzogP0RlYnVnZ2VyUGFuZUxvY2F0aW9uLFxuXG4gIC8vIExvY2F0aW9uIHRvIHVzZSBmb3IgbGF5b3V0IGlmIG5vIHVzZXIgcHJldmlvdXMgbG9jYXRpb24gaXMgc2V0LlxuICBkZWZhdWx0TG9jYXRpb246IHN0cmluZyxcblxuICAvLyBQcmV2aW91cyBkZWZhdWx0IGxvY2F0aW9uLCB1c2VkIHRvIHRyYWNrIGlmIHRoZSBzYXZlZCBsb2NhdGlvbiB3YXMgbm90XG4gIC8vIGV4cGxpY2l0bHkgY2hvc2VuIGJ5IHRoZSB1c2VyLlxuICBwcmV2aW91c0RlZmF1bHRMb2NhdGlvbj86IHN0cmluZyxcblxuICAvLyBPcHRpb25hbCBjYWxsYmFjayB0byBiZSBpbnZva2VkIHdoZW4gdGhlIHBhbmUgaXMgYmVpbmcgcmVzaXplZCAoZmxleCBzY2FsZSBjaGFuZ2VkKS5cbiAgb25QYW5lUmVzaXplPzogKHBhbmU6IGF0b20kUGFuZSwgbmV3RmxleFNjYWxlOiBudW1iZXIpID0+IGJvb2xlYW4sXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnZ2VyTGF5b3V0TWFuYWdlciB7XG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfc2VydmljZTogSURlYnVnU2VydmljZVxuICBfZGVidWdnZXJQYW5lczogQXJyYXk8RGVidWdnZXJQYW5lQ29uZmlnPlxuICBfcHJldmlvdXNEZWJ1Z2dlck1vZGU6IERlYnVnZ2VyTW9kZVR5cGVcbiAgX3BhbmVIaWRkZW5XYXJuaW5nU2hvd246IGJvb2xlYW5cbiAgX2xlZnRQYW5lQ29udGFpbmVyTW9kZWw6ID9EZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWxcbiAgX3JpZ2h0UGFuZUNvbnRhaW5lck1vZGVsOiA/RGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsXG4gIF9kZWJ1Z2dlclZpc2libGU6IGJvb2xlYW5cblxuICBjb25zdHJ1Y3RvcihzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLCBzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSkge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIHRoaXMuX3NlcnZpY2UgPSBzZXJ2aWNlXG4gICAgdGhpcy5fcHJldmlvdXNEZWJ1Z2dlck1vZGUgPSBEZWJ1Z2dlck1vZGUuU1RPUFBFRFxuICAgIHRoaXMuX3BhbmVIaWRkZW5XYXJuaW5nU2hvd24gPSBmYWxzZVxuICAgIHRoaXMuX2xlZnRQYW5lQ29udGFpbmVyTW9kZWwgPSBudWxsXG4gICAgdGhpcy5fcmlnaHRQYW5lQ29udGFpbmVyTW9kZWwgPSBudWxsXG4gICAgdGhpcy5fZGVidWdnZXJWaXNpYmxlID0gZmFsc2VcbiAgICB0aGlzLl9pbml0aWFsaXplRGVidWdnZXJQYW5lcygpXG4gICAgdGhpcy5fcmVzaG93RGVidWdnZXJQYW5lcyhzdGF0ZSlcblxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5fbGVmdFBhbmVDb250YWluZXJNb2RlbCAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuX2xlZnRQYW5lQ29udGFpbmVyTW9kZWwuZGlzcG9zZSgpXG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fcmlnaHRQYW5lQ29udGFpbmVyTW9kZWwgIT0gbnVsbCkge1xuICAgICAgICB0aGlzLl9yaWdodFBhbmVDb250YWluZXJNb2RlbC5kaXNwb3NlKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZGlzcG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHJlZ2lzdGVyQ29udGV4dE1lbnVzKCk6IHZvaWQge1xuICAgIC8vIEFkZCBjb250ZXh0IG1lbnVzIHRvIGxldCB0aGUgdXNlciByZXN0b3JlIGhpZGRlbiBwYW5lcy5cbiAgICB0aGlzLl9kZWJ1Z2dlclBhbmVzLmZvckVhY2goKHBhbmUpID0+IHtcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBgZGVidWdnZXI6c2hvdy13aW5kb3ctJHtwYW5lLnRpdGxlKCkucmVwbGFjZSgvIC9nLCBcIi1cIil9YFxuICAgICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgICAgICBbU3RyaW5nKGNvbW1hbmQpXTogKCkgPT4gdGhpcy5zaG93SGlkZGVuRGVidWdnZXJQYW5lKHBhbmUudXJpKSxcbiAgICAgICAgfSlcbiAgICAgIClcblxuICAgICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgICBhdG9tLmNvbnRleHRNZW51LmFkZCh7XG4gICAgICAgICAgXCIuZGVidWdnZXItY29udGFpbmVyXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbGFiZWw6IFwiRGVidWdnZXIgVmlld3NcIixcbiAgICAgICAgICAgICAgc3VibWVudTogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGxhYmVsOiBgU2hvdyAke3BhbmUudGl0bGUoKX0gd2luZG93YCxcbiAgICAgICAgICAgICAgICAgIGNvbW1hbmQsXG4gICAgICAgICAgICAgICAgICBzaG91bGREaXNwbGF5OiAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVidWdnZXJQYW5lID0gdGhpcy5fZGVidWdnZXJQYW5lcy5maW5kKChwKSA9PiBwLnVyaSA9PT0gcGFuZS51cmkpXG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWJ1Z2dlclBhbmUgIT0gbnVsbCAmJiAoZGVidWdnZXJQYW5lLmlzRW5hYmxlZCA9PSBudWxsIHx8IGRlYnVnZ2VyUGFuZS5pc0VuYWJsZWQoKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gIT0gbnVsbCAmJiBkZWJ1Z2dlclBhbmUucHJldmlvdXNMb2NhdGlvbi51c2VySGlkZGVuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgfSlcbiAgfVxuXG4gIF9vdmVycmlkZVBhbmVJbml0aWFsSGVpZ2h0KGRvY2tQYW5lOiBhdG9tJFBhbmUsIG5ld0ZsZXhTY2FsZTogbnVtYmVyLCBkZXNpcmVkSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpbnZhcmlhbnQoZG9ja1BhbmUuZWxlbWVudCAhPSBudWxsKVxuXG4gICAgaWYgKG5ld0ZsZXhTY2FsZSA9PT0gMSkge1xuICAgICAgLy8gbmV3RmxleFNjYWxlID09PSAxIHdoZW4gdGhlIHBhbmUgaXMgYWRkZWQgdGhlIGZpcnN0IHRpbWUuXG4gICAgICAvLyAkRmxvd0ZpeE1lXG4gICAgICBkb2NrUGFuZS5lbGVtZW50LnN0eWxlW1wiZmxleC1ncm93XCJdID0gXCIwXCJcbiAgICAgIC8vICRGbG93Rml4TWVcbiAgICAgIGRvY2tQYW5lLmVsZW1lbnQuc3R5bGVbXCJmbGV4LWJhc2lzXCJdID0gXCJhdXRvXCJcbiAgICAgIC8vICRGbG93Rml4TWVcbiAgICAgIGRvY2tQYW5lLmVsZW1lbnQuc3R5bGVbXCJvdmVyZmxvdy15XCJdID0gXCJzY3JvbGxcIlxuICAgICAgLy8gJEZsb3dGaXhNZVxuICAgICAgZG9ja1BhbmUuZWxlbWVudC5zdHlsZVtcIm1pbi1oZWlnaHRcIl0gPSBTdHJpbmcoZGVzaXJlZEhlaWdodCkgKyBcInB4XCJcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gT3RoZXJ3aXNlLCB0aGUgdXNlciBtdXN0IGhhdmUgcmVzaXplZCB0aGUgcGFuZS4gUmVtb3ZlIHRoZSBvdmVycmlkZSBzdHlsZXNcbiAgICAgIC8vIGFuZCBsZXQgaXQgYmVoYXZlIG5vcm1hbGx5LCB0aGUgdXNlciBpcyBpbiBjb250cm9sIG9mIHRoZSBsYXlvdXQgbm93LlxuICAgICAgLy8gJEZsb3dGaXhNZVxuICAgICAgZG9ja1BhbmUuZWxlbWVudC5zdHlsZVtcIm1pbi1oZWlnaHRcIl0gPSBcIjBweFwiXG4gICAgICAvLyAkRmxvd0ZpeE1lXG4gICAgICBkb2NrUGFuZS5lbGVtZW50LnN0eWxlW1wiZmxleC1iYXNpc1wiXSA9IFwiXCJcbiAgICB9XG4gIH1cblxuICBfaW5pdGlhbGl6ZURlYnVnZ2VyUGFuZXMoKTogdm9pZCB7XG4gICAgLy8gVGhpcyBjb25maWd1cmVzIHRoZSBkZWJ1Z2dlciBwYW5lcy4gQnkgZGVmYXVsdCwgdGhleSdsbCBhcHBlYXIgYmVsb3cgdGhlIHN0ZXBwaW5nXG4gICAgLy8gY29udHJvbHMgZnJvbSB0b3AgdG8gYm90dG9tIGluIHRoZSBvcmRlciB0aGV5J3JlIGRlZmluZWQgaGVyZS4gQWZ0ZXIgdGhhdCwgdGhlXG4gICAgLy8gdXNlciBpcyBmcmVlIHRvIG1vdmUgdGhlbSBhcm91bmQuXG4gICAgdGhpcy5fZGVidWdnZXJQYW5lcyA9IFtcbiAgICAgIHtcbiAgICAgICAgdXJpOiBERUJVR0dFUl9VUklfQkFTRSArIFwiY29udHJvbHNcIixcbiAgICAgICAgaXNMaWZldGltZVZpZXc6IHRydWUsXG4gICAgICAgIHRpdGxlOiAoKSA9PiBcIkRlYnVnZ2VyXCIsXG4gICAgICAgIGRlZmF1bHRMb2NhdGlvbjogREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04sXG4gICAgICAgIGlzRW5hYmxlZDogKCkgPT4gdHJ1ZSxcbiAgICAgICAgY3JlYXRlVmlldzogKCkgPT4gPERlYnVnZ2VyQ29udHJvbHNWaWV3IHNlcnZpY2U9e3RoaXMuX3NlcnZpY2V9IC8+LFxuICAgICAgICBvblBhbmVSZXNpemU6IChkb2NrUGFuZSwgbmV3RmxleFNjYWxlKSA9PiB7XG4gICAgICAgICAgdGhpcy5fb3ZlcnJpZGVQYW5lSW5pdGlhbEhlaWdodChkb2NrUGFuZSwgbmV3RmxleFNjYWxlLCAxMzUpXG5cbiAgICAgICAgICAvLyBJZiBuZXdGbGV4U2NhbGUgIT09IDEsIHRoYXQgbWVhbnMgdGhlIHVzZXIgbXVzdCBoYXZlIHJlc2l6ZWQgdGhpcyBwYW5lLlxuICAgICAgICAgIC8vIFJldHVybiB0cnVlIHRvIHVuaG9vayB0aGlzIGNhbGxiYWNrIGFuZCBsZXQgdGhlIHBhbmUgcmVzaXplIHBlciBBdG9tJ3NcbiAgICAgICAgICAvLyBkZWZhdWx0IGJlaGF2aW9yLiBUaGUgdXNlciBpcyBub3cgcmVzcG9uc2libGUgZm9yIHRoZSBwYW5lJ3MgaGVpZ2h0LlxuICAgICAgICAgIHJldHVybiBuZXdGbGV4U2NhbGUgIT09IDFcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHVyaTogREVCVUdHRVJfVVJJX0JBU0UgKyBcImRlYnVnZ2VydHJlZVwiLFxuICAgICAgICBpc0xpZmV0aW1lVmlldzogZmFsc2UsXG4gICAgICAgIGRlZmF1bHRMb2NhdGlvbjogREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04sXG4gICAgICAgIHRpdGxlOiAoKSA9PiBcIlByb2Nlc3Nlc1wiLFxuICAgICAgICBpc0VuYWJsZWQ6ICgpID0+IHRydWUsXG4gICAgICAgIGNyZWF0ZVZpZXc6ICgpID0+IDxEZWJ1Z2dlclByb2Nlc3NUcmVlVmlldyBzZXJ2aWNlPXt0aGlzLl9zZXJ2aWNlfSAvPixcbiAgICAgICAgZGVidWdnZXJNb2RlRmlsdGVyOiAobW9kZTogRGVidWdnZXJNb2RlVHlwZSkgPT4gbW9kZSAhPT0gRGVidWdnZXJNb2RlLlNUT1BQRUQsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB1cmk6IERFQlVHR0VSX1VSSV9CQVNFICsgXCJicmVha3BvaW50c1wiLFxuICAgICAgICBpc0xpZmV0aW1lVmlldzogZmFsc2UsXG4gICAgICAgIGRlZmF1bHRMb2NhdGlvbjogREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04sXG4gICAgICAgIHRpdGxlOiAoKSA9PiBcIkJyZWFrcG9pbnRzXCIsXG4gICAgICAgIGlzRW5hYmxlZDogKCkgPT4gdHJ1ZSxcbiAgICAgICAgY3JlYXRlVmlldzogKCkgPT4gPEJyZWFrcG9pbnRzVmlldyBzZXJ2aWNlPXt0aGlzLl9zZXJ2aWNlfSAvPixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHVyaTogREVCVUdHRVJfVVJJX0JBU0UgKyBcInNjb3Blc1wiLFxuICAgICAgICBpc0xpZmV0aW1lVmlldzogZmFsc2UsXG4gICAgICAgIGRlZmF1bHRMb2NhdGlvbjogREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04sXG4gICAgICAgIHRpdGxlOiAoKSA9PiBcIlNjb3Blc1wiLFxuICAgICAgICBpc0VuYWJsZWQ6ICgpID0+IHRydWUsXG4gICAgICAgIGNyZWF0ZVZpZXc6ICgpID0+IDxTY29wZXNWaWV3IHNlcnZpY2U9e3RoaXMuX3NlcnZpY2V9IC8+LFxuICAgICAgICBkZWJ1Z2dlck1vZGVGaWx0ZXI6IChtb2RlOiBEZWJ1Z2dlck1vZGVUeXBlKSA9PiBtb2RlICE9PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRCxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHVyaTogREVCVUdHRVJfVVJJX0JBU0UgKyBcIndhdGNoLWV4cHJlc3Npb25zXCIsXG4gICAgICAgIGlzTGlmZXRpbWVWaWV3OiBmYWxzZSxcbiAgICAgICAgZGVmYXVsdExvY2F0aW9uOiBcImJvdHRvbVwiLFxuICAgICAgICBwcmV2aW91c0RlZmF1bHRMb2NhdGlvbjogREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04sXG4gICAgICAgIHRpdGxlOiAoKSA9PiBcIldhdGNoIEV4cHJlc3Npb25zXCIsXG4gICAgICAgIGlzRW5hYmxlZDogKCkgPT4gdHJ1ZSxcbiAgICAgICAgY3JlYXRlVmlldzogKCkgPT4gPFdhdGNoVmlldyBzZXJ2aWNlPXt0aGlzLl9zZXJ2aWNlfSAvPixcbiAgICAgIH0sXG4gICAgXVxuXG4gICAgdGhpcy5yZWdpc3RlckNvbnRleHRNZW51cygpXG4gICAgdGhpcy5fcmVzdG9yZURlYnVnZ2VyUGFuZUxvY2F0aW9ucygpXG4gIH1cblxuICBfcmVzaG93RGVidWdnZXJQYW5lcyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IHZvaWQge1xuICAgIGlmIChzdGF0ZSAmJiBzdGF0ZS5zaG93RGVidWdnZXIpIHtcbiAgICAgIHRoaXMuc2hvd0RlYnVnZ2VyVmlld3MoKVxuICAgICAgdGhpcy5fZ2V0V29ya3NwYWNlRG9ja3MoKS5mb3JFYWNoKChkb2NrLCBpbmRleCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZG9jay5kb2NrLmlzVmlzaWJsZSAhPSBudWxsICYmXG4gICAgICAgICAgc3RhdGUud29ya3NwYWNlRG9ja3NWaXNpYmlsaXR5ICE9IG51bGwgJiZcbiAgICAgICAgICAhc3RhdGUud29ya3NwYWNlRG9ja3NWaXNpYmlsaXR5W2luZGV4XSAmJlxuICAgICAgICAgIGRvY2suZG9jay5pc1Zpc2libGUoKSAmJlxuICAgICAgICAgIGRvY2suZG9jay5oaWRlICE9IG51bGxcbiAgICAgICAgKSB7XG4gICAgICAgICAgZG9jay5kb2NrLmhpZGUoKVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICAvLyBIaWRpbmcgdGhlIGRvY2tzIG1pZ2h0IGhhdmUgY2hhbmdlZCB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgZGVidWdnZXJcbiAgICAgIC8vIGlmIHRoZSBvbmx5IGRvY2tzIGNvbnRhaW5pbmcgZGVidWdnZXIgcGFuZXMgYXJlIG5vdyBoaWRkZW4uXG4gICAgICB0aGlzLl91cGRhdGVEZWJ1Z2dlclZpc2liaWxpdHkoKVxuICAgIH1cbiAgfVxuXG4gIF91cGRhdGVEZWJ1Z2dlclZpc2liaWxpdHkoKTogdm9pZCB7XG4gICAgdGhpcy5fZGVidWdnZXJWaXNpYmxlID0gZmFsc2VcblxuICAgIC8vIFNlZSBpZiBhbnkgdmlzaWJsZSBkb2NrcyBjb250YWluIGEgcGFuZSB0aGF0IGNvbnRhaW5zIGEgZGVidWdnZXIgcGFuZS5cbiAgICB0aGlzLl9nZXRXb3Jrc3BhY2VEb2NrcygpLmZvckVhY2goKGRvY2spID0+IHtcbiAgICAgIGlmIChkb2NrLmRvY2suaXNWaXNpYmxlICE9IG51bGwgJiYgZG9jay5kb2NrLmlzVmlzaWJsZSgpKSB7XG4gICAgICAgIGRvY2suZG9jay5nZXRQYW5lcygpLmZvckVhY2goKHBhbmUpID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBwYW5lXG4gICAgICAgICAgICAgIC5nZXRJdGVtcygpXG4gICAgICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgICAgIChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lVmlld01vZGVsIHx8IGl0ZW0gaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWxcbiAgICAgICAgICAgICAgKSAhPSBudWxsXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLl9kZWJ1Z2dlclZpc2libGUgPSB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBzaG93SGlkZGVuRGVidWdnZXJQYW5lKHVyaTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgcGFuZSA9IHRoaXMuX2RlYnVnZ2VyUGFuZXMuZmluZCgocCkgPT4gcC51cmkgPT09IHVyaSlcbiAgICBpZiAocGFuZSAhPSBudWxsICYmIHBhbmUucHJldmlvdXNMb2NhdGlvbiAhPSBudWxsKSB7XG4gICAgICBwYW5lLnByZXZpb3VzTG9jYXRpb24udXNlckhpZGRlbiA9IGZhbHNlXG4gICAgfVxuXG4gICAgdGhpcy5zaG93RGVidWdnZXJWaWV3cygpXG4gIH1cblxuICBnZXRNb2RlbEZvckRlYnVnZ2VyVXJpKHVyaTogc3RyaW5nKTogYW55IHtcbiAgICBjb25zdCBjb25maWcgPSB0aGlzLl9kZWJ1Z2dlclBhbmVzLmZpbmQoKHBhbmUpID0+IHBhbmUudXJpID09PSB1cmkpXG4gICAgaWYgKGNvbmZpZyAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gbmV3IERlYnVnZ2VyUGFuZVZpZXdNb2RlbChjb25maWcsIGNvbmZpZy5pc0xpZmV0aW1lVmlldywgKHBhbmUpID0+IHRoaXMuX3BhbmVEZXN0cm95ZWQocGFuZSkpXG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIF9nZXRXb3Jrc3BhY2VEb2NrcygpOiBBcnJheTx7XG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGRvY2s6IGF0b20kQWJzdHJhY3RQYW5lQ29udGFpbmVyLFxuICAgIG9yaWVudGF0aW9uOiBzdHJpbmcsXG4gIH0+IHtcbiAgICBjb25zdCBkb2NrcyA9IG5ldyBBcnJheSg0KVxuXG4gICAgaW52YXJpYW50KGF0b20ud29ya3NwYWNlLmdldExlZnREb2NrICE9IG51bGwpXG4gICAgZG9ja3NbMF0gPSB7XG4gICAgICBuYW1lOiBcImxlZnRcIixcbiAgICAgIGRvY2s6IGF0b20ud29ya3NwYWNlLmdldExlZnREb2NrKCksXG4gICAgICBvcmllbnRhdGlvbjogXCJ2ZXJ0aWNhbFwiLFxuICAgIH1cblxuICAgIGludmFyaWFudChhdG9tLndvcmtzcGFjZS5nZXRCb3R0b21Eb2NrICE9IG51bGwpXG4gICAgZG9ja3NbMV0gPSB7XG4gICAgICBuYW1lOiBcImJvdHRvbVwiLFxuICAgICAgZG9jazogYXRvbS53b3Jrc3BhY2UuZ2V0Qm90dG9tRG9jaygpLFxuICAgICAgb3JpZW50YXRpb246IFwiaG9yaXpvbnRhbFwiLFxuICAgIH1cblxuICAgIGludmFyaWFudChhdG9tLndvcmtzcGFjZS5nZXRDZW50ZXIgIT0gbnVsbClcbiAgICBkb2Nrc1syXSA9IHtcbiAgICAgIG5hbWU6IFwiY2VudGVyXCIsXG4gICAgICBkb2NrOiBhdG9tLndvcmtzcGFjZS5nZXRDZW50ZXIoKSxcbiAgICAgIG9yaWVudGF0aW9uOiBcImhvcml6b250YWxcIixcbiAgICB9XG5cbiAgICBpbnZhcmlhbnQoYXRvbS53b3Jrc3BhY2UuZ2V0UmlnaHREb2NrICE9IG51bGwpXG4gICAgZG9ja3NbM10gPSB7XG4gICAgICBuYW1lOiBcInJpZ2h0XCIsXG4gICAgICBkb2NrOiBhdG9tLndvcmtzcGFjZS5nZXRSaWdodERvY2soKSxcbiAgICAgIG9yaWVudGF0aW9uOiBcInZlcnRpY2FsXCIsXG4gICAgfVxuXG4gICAgcmV0dXJuIGRvY2tzXG4gIH1cblxuICBfaXNEb2NrRW1wdHkoZG9jazogYXRvbSRBYnN0cmFjdFBhbmVDb250YWluZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBwYW5lcyA9IGRvY2suZ2V0UGFuZXMoKVxuXG4gICAgLy8gQSBkb2NrIGlzIGVtcHR5IGZvciBvdXIgcHVycG9zZXMgaWYgaXQgaGFzIG5vdGhpbmcgdmlzaWJsZSBpbiBpdC4gSWYgYSBkb2NrXG4gICAgLy8gd2l0aCBubyBpdGVtcyBpcyBsZWZ0IG9wZW4sIEF0b20gaW1wbGljaXRseSBhZGRzIGEgc2luZ2xlIHBhbmUgd2l0aCBubyBpdGVtc1xuICAgIC8vIGluIGl0LCBzbyBjaGVjayBmb3Igbm8gcGFuZXMsIG9yIGEgc2luZ2xlIHBhbmUgd2l0aCBubyBpdGVtcy5cbiAgICByZXR1cm4gcGFuZXMubGVuZ3RoID09PSAwIHx8IChwYW5lcy5sZW5ndGggPT09IDEgJiYgcGFuZXNbMF0uZ2V0SXRlbXMoKS5sZW5ndGggPT09IDApXG4gIH1cblxuICBfYXBwZW5kSXRlbVRvRG9jayhcbiAgICBwYW5lQ29uZmlnOiA/RGVidWdnZXJQYW5lQ29uZmlnLFxuICAgIGRvY2s6IGF0b20kQWJzdHJhY3RQYW5lQ29udGFpbmVyLFxuICAgIGl0ZW06IE9iamVjdCxcbiAgICBkZWJ1Z2dlckl0ZW1zUGVyRG9jazogTWFwPGF0b20kQWJzdHJhY3RQYW5lQ29udGFpbmVyLCBudW1iZXI+XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHBhbmVzID0gZG9jay5nZXRQYW5lcygpXG4gICAgaW52YXJpYW50KHBhbmVzLmxlbmd0aCA+PSAxKVxuXG4gICAgY29uc3QgZG9ja1BhbmUgPSBwYW5lc1twYW5lcy5sZW5ndGggLSAxXVxuICAgIGlmICh0aGlzLl9pc0RvY2tFbXB0eShkb2NrKSkge1xuICAgICAgZG9ja1BhbmUuYWRkSXRlbShpdGVtKVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZG9ja0NvbmZpZyA9IHRoaXMuX2dldFdvcmtzcGFjZURvY2tzKCkuZmluZCgoZCkgPT4gZC5kb2NrID09PSBkb2NrKVxuICAgICAgaWYgKGRvY2tDb25maWcgPT0gbnVsbCkge1xuICAgICAgICAvLyBUaGlzIGl0ZW0gaXMgYmVpbmcgYWRkZWQgdG8gYSBuZXN0ZWQgUGFuZUNvbnRhaW5lciByYXRoZXIgdGhhblxuICAgICAgICAvLyBkaXJlY3RseSB0byBhIGRvY2suIFRoaXMgaXMgb25seSBkb25lIGZvciB2ZXJ0aWNhbCBsYXlvdXRzLlxuICAgICAgICBkb2NrQ29uZmlnID0geyBvcmllbnRhdGlvbjogXCJ2ZXJ0aWNhbFwiIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGRvY2tDb25maWcub3JpZW50YXRpb24gPT09IFwiaG9yaXpvbnRhbFwiKSB7XG4gICAgICAgIC8vIEFkZCB0aGUgaXRlbSBhcyBhIG5ldyB0YWIgaW4gdGhlIGV4aXN0aW5nIHBhbmUgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IGFjdGl2ZSBwYW5lIGZvciB0aGUgZG9jay5cbiAgICAgICAgZG9ja1BhbmUuYWRkSXRlbShpdGVtKVxuICAgICAgICB0cnkge1xuICAgICAgICAgIGRvY2tQYW5lLmFjdGl2YXRlSXRlbShpdGVtKVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gRHVyaW5nIHRlc3RpbmcsIEkgc2F3IHNvbWUgY2FzZXMgd2hlcmUgQXRvbSB0aHJldyB0cnlpbmcgdG8gYWN0aXZhdGUgYW4gaXRlbVxuICAgICAgICAgIC8vIHRoYXQgd2FzIHN0aWxsIGluIHByb2dyZXNzIG9mIGJlaW5nIGFkZGVkLiBUaGlzIHdhcyB0ZXN0ZWQgb24gYSBCZXRhIHJlbGVhc2VcbiAgICAgICAgICAvLyBhbmQgbWF5IGluZGljYXRlIGEgdGVtcG9yYXJ5IGJ1Zy4gSG93ZXZlciwgdGhlcmUgaXMgbm8gcmVhc29uIHRvIHRocm93IGhlcmVcbiAgICAgICAgICAvLyBhbmQgc3RvcCBsYXlpbmcgb3V0IHRoZSBkZWJ1Z2dlciBpZiBhbiBpdGVtIGNvdWxkIG5vdCBiZSBzZXQgYXMgYWN0aXZlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBXaGVuIGFkZGluZyB0byBhIHZlcnRpY2FsIGRvY2sgdGhhdCBpcyBub3QgZW1wdHksIGJ1dCBjb250YWlucyBubyBkZWJ1Z2dlclxuICAgICAgICAvLyBpdGVtcywgYWRkIHRoZSBkZWJ1Z2dlciBwYW5lIGNvbnRhaW5lciBhcyBhIG5ldyB0YWIgaXRlbS4gT3RoZXJ3aXNlLCBhcHBlbmRcbiAgICAgICAgLy8gZG93bndhcmQuXG4gICAgICAgIGlmIChkZWJ1Z2dlckl0ZW1zUGVyRG9jay5nZXQoZG9jaykgPT0gbnVsbCkge1xuICAgICAgICAgIGRvY2tQYW5lLmFkZEl0ZW0oaXRlbSlcbiAgICAgICAgICBkb2NrUGFuZS5hY3RpdmF0ZUl0ZW0oaXRlbSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkb2NrUGFuZS5zcGxpdERvd24oe1xuICAgICAgICAgICAgaXRlbXM6IFtpdGVtXSxcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gS2VlcCB0cmFjayBvZiB3aGljaCBkb2NrKHMpIHdlJ3ZlIGFwcGVuZGVkIGRlYnVnZ2VyIHBhbmVzIGludG8uIFRoaXNcbiAgICAvLyBhbGxvd3MgdXMgdG8gcXVpY2tseSBjaGVjayBpZiB0aGUgZG9jayBuZWVkcyB0byBiZSBzcGxpdCB0byBzZXBhcmF0ZVxuICAgIC8vIGRlYnVnZ2VyIHBhbmVzIGFuZCBwcmUtZXhpc3RpbmcgcGFuZXMgdGhhdCBoYXZlIG5vdGhpbmcgdG8gZG8gd2l0aFxuICAgIC8vIHRoZSBkZWJ1Z2dlci5cbiAgICBpZiAoZGVidWdnZXJJdGVtc1BlckRvY2suZ2V0KGRvY2spID09IG51bGwpIHtcbiAgICAgIGRlYnVnZ2VySXRlbXNQZXJEb2NrLnNldChkb2NrLCAxKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBpdGVtQ291bnQgPSBkZWJ1Z2dlckl0ZW1zUGVyRG9jay5nZXQoZG9jaylcbiAgICAgIGRlYnVnZ2VySXRlbXNQZXJEb2NrLnNldChkb2NrLCBpdGVtQ291bnQgKyAxKVxuICAgIH1cblxuICAgIGlmIChkb2NrLmlzVmlzaWJsZSAhPSBudWxsICYmIGRvY2suc2hvdyAhPSBudWxsICYmICFkb2NrLmlzVmlzaWJsZSgpKSB7XG4gICAgICBkb2NrLnNob3coKVxuICAgIH1cblxuICAgIC8vIElmIHRoZSBkZWJ1Z2dlciBwYW5lIGNvbmZpZyBoYXMgYSBjdXN0b20gbGF5b3V0IGNhbGxiYWNrLCBob29rIGl0IHVwIG5vdy5cbiAgICBpZiAocGFuZUNvbmZpZyAhPSBudWxsICYmIHBhbmVDb25maWcub25QYW5lUmVzaXplICE9IG51bGwpIHtcbiAgICAgIGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgICAgZGlzcG9zYWJsZXMuYWRkKGRvY2tQYW5lLm9uV2lsbERlc3Ryb3koKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSlcbiAgICAgIGRpc3Bvc2FibGVzLmFkZChcbiAgICAgICAgZG9ja1BhbmUub25EaWRDaGFuZ2VGbGV4U2NhbGUoKG5ld0ZsZXhTY2FsZSkgPT4ge1xuICAgICAgICAgIGludmFyaWFudChwYW5lQ29uZmlnLm9uUGFuZVJlc2l6ZSAhPSBudWxsKVxuICAgICAgICAgIGlmIChwYW5lQ29uZmlnLm9uUGFuZVJlc2l6ZShkb2NrUGFuZSwgbmV3RmxleFNjYWxlKSkge1xuICAgICAgICAgICAgLy8gVGhlIGNhbGxiYWNrIGhhcyByZXF1ZXN0ZWQgdG8gYmUgdW5yZWdpc3RlcmVkLlxuICAgICAgICAgICAgZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIHJlc2V0TGF5b3V0KCk6IHZvaWQge1xuICAgIC8vIFJlbW92ZSBhbGwgZGVidWdnZXIgcGFuZXMgZnJvbSB0aGUgVUkuXG4gICAgdGhpcy5oaWRlRGVidWdnZXJWaWV3cyhmYWxzZSlcblxuICAgIC8vIEZvcmdldCBhbGwgdGhlaXIgcHJldmlvdXMgbG9jYXRpb25zLlxuICAgIGZvciAoY29uc3QgZGVidWdnZXJQYW5lIG9mIHRoaXMuX2RlYnVnZ2VyUGFuZXMpIHtcbiAgICAgIGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uID0gbnVsbFxuICAgICAgY29uc3Qga2V5ID0gdGhpcy5fZ2V0UGFuZVN0b3JhZ2VLZXkoZGVidWdnZXJQYW5lLnVyaSlcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgXCJcIilcbiAgICB9XG5cbiAgICAvLyBGb3JnZXQgYWxsIHByZXZpb3VzIGRvY2sgc2l6ZXM7XG4gICAgZm9yIChjb25zdCBkb2NrSW5mbyBvZiB0aGlzLl9nZXRXb3Jrc3BhY2VEb2NrcygpKSB7XG4gICAgICBjb25zdCB7IG5hbWUgfSA9IGRvY2tJbmZvXG4gICAgICBjb25zdCBrZXkgPSB0aGlzLl9nZXRQYW5lU3RvcmFnZUtleShcImRvY2stc2l6ZVwiICsgbmFtZSlcbiAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSlcbiAgICB9XG5cbiAgICAvLyBQb3AgdGhlIGRlYnVnZ2VyIG9wZW4gd2l0aCB0aGUgZGVmYXVsdCBsYXlvdXQuXG4gICAgdGhpcy5fZGVidWdnZXJQYW5lcyA9IFtdXG4gICAgdGhpcy5fcGFuZUhpZGRlbldhcm5pbmdTaG93biA9IGZhbHNlXG4gICAgdGhpcy5faW5pdGlhbGl6ZURlYnVnZ2VyUGFuZXMoKVxuICAgIHRoaXMuc2hvd0RlYnVnZ2VyVmlld3MoKVxuICB9XG5cbiAgX2dldFBhbmVTdG9yYWdlS2V5KHVyaTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJkZWJ1Z2dlci1wYW5lLWxvY2F0aW9uLVwiICsgdXJpXG4gIH1cblxuICBfZGVzZXJpYWxpemVTYXZlZExvY2F0aW9uKHNhdmVkSXRlbTogc3RyaW5nKTogP0RlYnVnZ2VyUGFuZUxvY2F0aW9uIHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb2JqID0gSlNPTi5wYXJzZShzYXZlZEl0ZW0pXG4gICAgICBpZiAob2JqICE9IG51bGwgJiYgb2JqLmRvY2sgIT0gbnVsbCAmJiBvYmoubGF5b3V0SW5kZXggIT0gbnVsbCAmJiBvYmoudXNlckhpZGRlbiAhPSBudWxsKSB7XG4gICAgICAgIHJldHVybiBvYmpcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7fVxuXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIF9yZXN0b3JlRGVidWdnZXJQYW5lTG9jYXRpb25zKCk6IHZvaWQge1xuICAgIC8vIFNlZSBpZiB0aGVyZSBhcmUgc2F2ZWQgcHJldmlvdXMgbG9jYXRpb25zIGZvciB0aGUgZGVidWdnZXIgcGFuZXMuXG4gICAgZm9yIChjb25zdCBkZWJ1Z2dlclBhbmUgb2YgdGhpcy5fZGVidWdnZXJQYW5lcykge1xuICAgICAgY29uc3Qgc2F2ZWRJdGVtID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0odGhpcy5fZ2V0UGFuZVN0b3JhZ2VLZXkoZGVidWdnZXJQYW5lLnVyaSkpXG4gICAgICBpZiAoc2F2ZWRJdGVtICE9IG51bGwpIHtcbiAgICAgICAgZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gPSB0aGlzLl9kZXNlcmlhbGl6ZVNhdmVkTG9jYXRpb24oc2F2ZWRJdGVtKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9zYXZlRGVidWdnZXJQYW5lTG9jYXRpb25zKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgZG9ja0luZm8gb2YgdGhpcy5fZ2V0V29ya3NwYWNlRG9ja3MoKSkge1xuICAgICAgY29uc3QgeyBuYW1lLCBkb2NrIH0gPSBkb2NrSW5mb1xuICAgICAgY29uc3QgcGFuZXMgPSBkb2NrLmdldFBhbmVzKClcbiAgICAgIGxldCBsYXlvdXRJbmRleCA9IDBcbiAgICAgIGxldCBkb2NrQ29udGFpbnNEZWJ1Z2dlckl0ZW0gPSBmYWxzZVxuICAgICAgZm9yIChjb25zdCBwYW5lIG9mIHBhbmVzKSB7XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBwYW5lLmdldEl0ZW1zKCkpIHtcbiAgICAgICAgICBjb25zdCBwYW5lSXRlbXMgPSBbXVxuICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsKSB7XG4gICAgICAgICAgICBwYW5lSXRlbXMucHVzaCguLi5pdGVtLmdldEFsbEl0ZW1zKCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhbmVJdGVtcy5wdXNoKGl0ZW0pXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZm9yIChjb25zdCBpdGVtVG9TYXZlIG9mIHBhbmVJdGVtcykge1xuICAgICAgICAgICAgaWYgKGl0ZW1Ub1NhdmUgaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVWaWV3TW9kZWwpIHtcbiAgICAgICAgICAgICAgY29uc3QgbG9jYXRpb24gPSB7XG4gICAgICAgICAgICAgICAgZG9jazogbmFtZSxcbiAgICAgICAgICAgICAgICBsYXlvdXRJbmRleCxcbiAgICAgICAgICAgICAgICB1c2VySGlkZGVuOiBmYWxzZSxcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGRvY2tDb250YWluc0RlYnVnZ2VySXRlbSA9IHRydWVcbiAgICAgICAgICAgICAgaXRlbVRvU2F2ZS5nZXRDb25maWcoKS5wcmV2aW91c0xvY2F0aW9uID0gbG9jYXRpb25cbiAgICAgICAgICAgICAgbGF5b3V0SW5kZXgrK1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXkgPSB0aGlzLl9nZXRQYW5lU3RvcmFnZUtleShcImRvY2stc2l6ZVwiICsgbmFtZSlcbiAgICAgIGlmIChkb2NrQ29udGFpbnNEZWJ1Z2dlckl0ZW0gJiYgZG9jay5zdGF0ZSAhPSBudWxsKSB7XG4gICAgICAgIC8vIFNhdmUgdGhlIHNpemUgb2YgYSBkb2NrIG9ubHkgaWYgaXQgY29udGFpbnMgYSBkZWJ1Z2dlciBpdGVtLlxuICAgICAgICBjb25zdCBzaXplSW5mbyA9IEpTT04uc3RyaW5naWZ5KGRvY2suc3RhdGUuc2l6ZSlcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBzaXplSW5mbylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTZXJpYWxpemUgdG8gc3RvcmFnZS5cbiAgICBmb3IgKGNvbnN0IGRlYnVnZ2VyUGFuZSBvZiB0aGlzLl9kZWJ1Z2dlclBhbmVzKSB7XG4gICAgICBjb25zdCBrZXkgPSB0aGlzLl9nZXRQYW5lU3RvcmFnZUtleShkZWJ1Z2dlclBhbmUudXJpKVxuXG4gICAgICAvLyBJZiB0aGUgbG9jYXRpb24gaXMgdGhlIHBhbmUncyBkZWZhdWx0IGxvY2F0aW9uLCBubyBuZWVkIHRvIHN0b3JlXG4gICAgICAvLyBpdCBleHBsaWNpdGx5LiBUaGlzIGlzIGFsc28gaGVscGZ1bCBpZiB0aGUgZGVmYXVsdCBjaGFuZ2VzIGluIHRoZVxuICAgICAgLy8gZnV0dXJlLlxuICAgICAgaWYgKFxuICAgICAgICBkZWJ1Z2dlclBhbmUucHJldmlvdXNMb2NhdGlvbiAhPSBudWxsICYmXG4gICAgICAgICFkZWJ1Z2dlclBhbmUucHJldmlvdXNMb2NhdGlvbi51c2VySGlkZGVuICYmXG4gICAgICAgIChkZWJ1Z2dlclBhbmUucHJldmlvdXNMb2NhdGlvbi5kb2NrID09PSBkZWJ1Z2dlclBhbmUuZGVmYXVsdExvY2F0aW9uIHx8XG4gICAgICAgICAgKGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLmRvY2sgPT09IGRlYnVnZ2VyUGFuZS5wcmV2aW91c0RlZmF1bHRMb2NhdGlvbiAmJlxuICAgICAgICAgICAgIWRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLnVzZXJDdXN0b21pemVkKSlcbiAgICAgICkge1xuICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gIT0gbnVsbCkge1xuICAgICAgICAgIGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLnVzZXJDdXN0b21pemVkID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvYyA9IEpTT04uc3RyaW5naWZ5KGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uKVxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIGxvYylcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfc2hvdWxkRGVzdHJveVBhbmVJdGVtKG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUsIGl0ZW06IGF0b20kUGFuZUl0ZW0pOiBib29sZWFuIHtcbiAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIERlYnVnZ2VyUGFuZVZpZXdNb2RlbCkge1xuICAgICAgY29uc3QgY29uZmlnID0gaXRlbS5nZXRDb25maWcoKVxuICAgICAgaWYgKGNvbmZpZy5kZWJ1Z2dlck1vZGVGaWx0ZXIgIT0gbnVsbCAmJiAhY29uZmlnLmRlYnVnZ2VyTW9kZUZpbHRlcihtb2RlKSkge1xuICAgICAgICBpdGVtLnNldFJlbW92ZWRGcm9tTGF5b3V0KHRydWUpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZGVidWdnZXJNb2RlQ2hhbmdlZCgpOiB2b2lkIHtcbiAgICBjb25zdCBtb2RlID0gdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3NNb2RlKClcblxuICAgIC8vIE1vc3QgcGFuZXMgZGlzYXBwZWFyIHdoZW4gdGhlIGRlYnVnZ2VyIGlzIHN0b3BwZWQsIG9ubHkga2VlcFxuICAgIC8vIHRoZSBvbmVzIHRoYXQgc2hvdWxkIHN0aWxsIGJlIHNob3duLlxuICAgIGlmIChtb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RPUFBJTkcgJiYgdGhpcy5fcHJldmlvdXNEZWJ1Z2dlck1vZGUgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEKSB7XG4gICAgICB0aGlzLl9zYXZlRGVidWdnZXJQYW5lTG9jYXRpb25zKClcbiAgICB9IGVsc2UgaWYgKG1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEKSB7XG4gICAgICBkZXN0cm95SXRlbVdoZXJlKChpdGVtKSA9PiB7XG4gICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsKSB7XG4gICAgICAgICAgLy8gRm9yd2FyZCB0aGUgZGVzdHJ1Y3Rpb24gbG9naWMgdG8gdGhlIGNvbnRpYW5lci5cbiAgICAgICAgICBpdGVtLmRlc3Ryb3lXaGVyZSgoaW5uZXJJdGVtKSA9PiB0aGlzLl9zaG91bGREZXN0cm95UGFuZUl0ZW0obW9kZSwgaW5uZXJJdGVtKSlcblxuICAgICAgICAgIHRoaXMuX2Rlc3Ryb3lDb250YWluZXJJZkVtcHR5KGl0ZW0pXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fc2hvdWxkRGVzdHJveVBhbmVJdGVtKG1vZGUsIGl0ZW0pXG4gICAgICB9KVxuICAgIH1cblxuICAgIHRoaXMuX3ByZXZpb3VzRGVidWdnZXJNb2RlID0gbW9kZVxuICB9XG5cbiAgX2NvdW50UGFuZXNGb3JUYXJnZXREb2NrKGRvY2tOYW1lOiBzdHJpbmcsIGRlZmF1bHREb2NrTmFtZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBjb25zdCBtb2RlID0gdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3NNb2RlKClcbiAgICByZXR1cm4gdGhpcy5fZGVidWdnZXJQYW5lc1xuICAgICAgLmZpbHRlcihcbiAgICAgICAgLy8gRmlsdGVyIG91dCBhbnkgcGFuZXMgdGhhdCB0aGUgdXNlciBoYXMgaGlkZGVuIG9yIHRoYXQgYXJlbid0IHZpc2libGVcbiAgICAgICAgLy8gaW4gdGhlIGN1cnJlbnQgZGVidWcgbW9kZS5cbiAgICAgICAgKGRlYnVnZ2VyUGFuZSkgPT5cbiAgICAgICAgICAoZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gPT0gbnVsbCB8fCAhZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24udXNlckhpZGRlbikgJiZcbiAgICAgICAgICAoZGVidWdnZXJQYW5lLmRlYnVnZ2VyTW9kZUZpbHRlciA9PSBudWxsIHx8IGRlYnVnZ2VyUGFuZS5kZWJ1Z2dlck1vZGVGaWx0ZXIobW9kZSkpXG4gICAgICApXG4gICAgICAubWFwKChkZWJ1Z2dlclBhbmUpID0+IHtcbiAgICAgICAgLy8gTWFwIGVhY2ggZGVidWdnZXIgcGFuZSB0byB0aGUgbmFtZSBvZiB0aGUgZG9jayBpdCB3aWxsIGJlbG9uZyB0by5cbiAgICAgICAgaWYgKGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uICE9IG51bGwpIHtcbiAgICAgICAgICBjb25zdCBwcmV2aW91c0RvY2sgPSB0aGlzLl9nZXRXb3Jrc3BhY2VEb2NrcygpLmZpbmQoXG4gICAgICAgICAgICAoZCkgPT4gZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gIT0gbnVsbCAmJiBkLm5hbWUgPT09IGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLmRvY2tcbiAgICAgICAgICApXG4gICAgICAgICAgaWYgKHByZXZpb3VzRG9jayAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJldmlvdXNEb2NrLm5hbWVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmF1bHREb2NrTmFtZVxuICAgICAgfSlcbiAgICAgIC5maWx0ZXIoKHRhcmdldERvY2tOYW1lKSA9PiB0YXJnZXREb2NrTmFtZSA9PT0gZG9ja05hbWUpLmxlbmd0aFxuICB9XG5cbiAgX2dldFNhdmVkRGVidWdnZXJQYW5lU2l6ZShkb2NrOiB7IG5hbWU6IHN0cmluZywgZG9jazogYXRvbSRBYnN0cmFjdFBhbmVDb250YWluZXIsIG9yaWVudGF0aW9uOiBzdHJpbmcgfSk6ID9udW1iZXIge1xuICAgIGNvbnN0IGtleSA9IHRoaXMuX2dldFBhbmVTdG9yYWdlS2V5KFwiZG9jay1zaXplXCIgKyBkb2NrLm5hbWUpXG4gICAgY29uc3Qgc2F2ZWRJdGVtID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KVxuICAgIGlmIChzYXZlZEl0ZW0gIT0gbnVsbCkge1xuICAgICAgY29uc3Qgc2l6ZUluZm8gPSBKU09OLnBhcnNlKHNhdmVkSXRlbSlcbiAgICAgIGlmICghTnVtYmVyLmlzTmFOKHNpemVJbmZvKSkge1xuICAgICAgICByZXR1cm4gc2l6ZUluZm9cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgc2hvd0RlYnVnZ2VyVmlld3MoKTogdm9pZCB7XG4gICAgLy8gSGlkZSBhbnkgZGVidWdnZXIgcGFuZXMgb3RoZXIgdGhhbiB0aGUgY29udHJvbHMgc28gd2UgaGF2ZSBhIGtub3duXG4gICAgLy8gc3RhcnRpbmcgcG9pbnQgZm9yIHByZXBhcmluZyB0aGUgbGF5b3V0LlxuICAgIHRoaXMuaGlkZURlYnVnZ2VyVmlld3ModHJ1ZSlcblxuICAgIGNvbnN0IGFkZGVkSXRlbXNCeURvY2sgPSBuZXcgTWFwKClcbiAgICBjb25zdCBkZWZhdWx0RG9jayA9IHRoaXMuX2dldFdvcmtzcGFjZURvY2tzKCkuZmluZCgoZCkgPT4gZC5uYW1lID09PSBERUJVR0dFUl9QQU5FTFNfREVGQVVMVF9MT0NBVElPTilcbiAgICBpbnZhcmlhbnQoZGVmYXVsdERvY2sgIT0gbnVsbClcblxuICAgIGNvbnN0IGxlZnREb2NrID0gdGhpcy5fZ2V0V29ya3NwYWNlRG9ja3MoKS5maW5kKChkKSA9PiBkLm5hbWUgPT09IFwibGVmdFwiKVxuICAgIGludmFyaWFudChsZWZ0RG9jayAhPSBudWxsKVxuXG4gICAgbGV0IGxlZnRQYW5lQ29udGFpbmVyID0gbnVsbFxuICAgIGlmICh0aGlzLl9jb3VudFBhbmVzRm9yVGFyZ2V0RG9jayhsZWZ0RG9jay5uYW1lLCBkZWZhdWx0RG9jay5uYW1lKSA+IDApIHtcbiAgICAgIGxlZnRQYW5lQ29udGFpbmVyID0gY3JlYXRlUGFuZUNvbnRhaW5lcigpXG4gICAgICBjb25zdCBzaXplID0gdGhpcy5fZ2V0U2F2ZWREZWJ1Z2dlclBhbmVTaXplKGxlZnREb2NrKVxuICAgICAgdGhpcy5fbGVmdFBhbmVDb250YWluZXJNb2RlbCA9IHRoaXMuX2FkZFBhbmVDb250YWluZXJUb1dvcmtzcGFjZShcbiAgICAgICAgbGVmdFBhbmVDb250YWluZXIsXG4gICAgICAgIGxlZnREb2NrLmRvY2ssXG4gICAgICAgIGFkZGVkSXRlbXNCeURvY2ssXG4gICAgICAgIHNpemVcbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCByaWdodERvY2sgPSB0aGlzLl9nZXRXb3Jrc3BhY2VEb2NrcygpLmZpbmQoKGQpID0+IGQubmFtZSA9PT0gXCJyaWdodFwiKVxuICAgIGludmFyaWFudChyaWdodERvY2sgIT0gbnVsbClcblxuICAgIGxldCByaWdodFBhbmVDb250YWluZXIgPSBudWxsXG4gICAgaWYgKHRoaXMuX2NvdW50UGFuZXNGb3JUYXJnZXREb2NrKHJpZ2h0RG9jay5uYW1lLCBkZWZhdWx0RG9jay5uYW1lKSA+IDApIHtcbiAgICAgIHJpZ2h0UGFuZUNvbnRhaW5lciA9IGNyZWF0ZVBhbmVDb250YWluZXIoKVxuICAgICAgY29uc3Qgc2l6ZSA9IHRoaXMuX2dldFNhdmVkRGVidWdnZXJQYW5lU2l6ZShyaWdodERvY2spXG4gICAgICB0aGlzLl9yaWdodFBhbmVDb250YWluZXJNb2RlbCA9IHRoaXMuX2FkZFBhbmVDb250YWluZXJUb1dvcmtzcGFjZShcbiAgICAgICAgcmlnaHRQYW5lQ29udGFpbmVyLFxuICAgICAgICByaWdodERvY2suZG9jayxcbiAgICAgICAgYWRkZWRJdGVtc0J5RG9jayxcbiAgICAgICAgc2l6ZVxuICAgICAgKVxuICAgIH1cblxuICAgIC8vIExheSBvdXQgdGhlIHJlbWFpbmluZyBkZWJ1Z2dlciBwYW5lcyBhY2NvcmRpbmcgdG8gdGhlaXIgY29uZmlndXJhdGlvbnMuXG4gICAgLy8gU29ydCB0aGUgZGVidWdnZXIgcGFuZXMgYnkgdGhlIGluZGV4IGF0IHdoaWNoIHRoZXkgYXBwZWFyZWQgdGhlIGxhc3RcbiAgICAvLyB0aW1lIHRoZXkgd2VyZSBwb3NpdGlvbmVkLCBzbyB3ZSBtYWludGFpbiB0aGUgcmVsYXRpdmUgb3JkZXJpbmcgb2ZcbiAgICAvLyBkZWJ1Z2dlciBwYW5lcyB3aXRoaW4gdGhlIHNhbWUgZG9jay5cbiAgICBjb25zdCBtb2RlID0gdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3NNb2RlKClcbiAgICB0aGlzLl9kZWJ1Z2dlclBhbmVzXG4gICAgICAuc2xpY2UoKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3QgYVBvcyA9IGEucHJldmlvdXNMb2NhdGlvbiA9PSBudWxsID8gMCA6IGEucHJldmlvdXNMb2NhdGlvbi5sYXlvdXRJbmRleFxuICAgICAgICBjb25zdCBiUG9zID0gYi5wcmV2aW91c0xvY2F0aW9uID09IG51bGwgPyAwIDogYi5wcmV2aW91c0xvY2F0aW9uLmxheW91dEluZGV4XG4gICAgICAgIHJldHVybiBhUG9zIC0gYlBvc1xuICAgICAgfSlcbiAgICAgIC5maWx0ZXIoXG4gICAgICAgIChkZWJ1Z2dlclBhbmUpID0+XG4gICAgICAgICAgKGRlYnVnZ2VyUGFuZS5pc0VuYWJsZWQgPT0gbnVsbCB8fCBkZWJ1Z2dlclBhbmUuaXNFbmFibGVkKCkpICYmXG4gICAgICAgICAgKGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uID09IG51bGwgfHwgIWRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLnVzZXJIaWRkZW4pXG4gICAgICApXG4gICAgICAuZm9yRWFjaCgoZGVidWdnZXJQYW5lKSA9PiB7XG4gICAgICAgIGxldCB0YXJnZXREb2NrID0gZGVmYXVsdERvY2tcblxuICAgICAgICAvLyBJZiB0aGlzIHBhbmUgaGFkIGEgcHJldmlvdXMgbG9jYXRpb24sIHJlc3RvcmUgdG8gdGhlIHByZXZpb3VzIGRvY2suXG4gICAgICAgIGNvbnN0IGxvYyA9XG4gICAgICAgICAgZGVidWdnZXJQYW5lLnByZXZpb3VzTG9jYXRpb24gIT0gbnVsbCA/IGRlYnVnZ2VyUGFuZS5wcmV2aW91c0xvY2F0aW9uLmRvY2sgOiBkZWJ1Z2dlclBhbmUuZGVmYXVsdExvY2F0aW9uXG4gICAgICAgIGNvbnN0IHByZXZpb3VzRG9jayA9IHRoaXMuX2dldFdvcmtzcGFjZURvY2tzKCkuZmluZCgoZCkgPT4gZC5uYW1lID09PSBsb2MpXG4gICAgICAgIGlmIChwcmV2aW91c0RvY2sgIT0gbnVsbCkge1xuICAgICAgICAgIHRhcmdldERvY2sgPSBwcmV2aW91c0RvY2tcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbmRlciB0byBhIG5lc3RlZCBwYW5lIGNvbnRhaW5lciBmb3IgdGhlIHR3byB2ZXJ0aWNhbCBkb2Nrc1xuICAgICAgICAvLyByYXRoZXIgdGhhbiBhZGRpbmcgdGhlIGl0ZW0gZGlyZWN0bHkgdG8gdGhlIGRvY2sgaXRzZWxmLlxuICAgICAgICBsZXQgdGFyZ2V0Q29udGFpbmVyID0gdGFyZ2V0RG9jay5kb2NrXG4gICAgICAgIGlmICh0YXJnZXREb2NrLm5hbWUgPT09IFwibGVmdFwiKSB7XG4gICAgICAgICAgdGFyZ2V0Q29udGFpbmVyID0gbGVmdFBhbmVDb250YWluZXJcbiAgICAgICAgfSBlbHNlIGlmICh0YXJnZXREb2NrLm5hbWUgPT09IFwicmlnaHRcIikge1xuICAgICAgICAgIHRhcmdldENvbnRhaW5lciA9IHJpZ2h0UGFuZUNvbnRhaW5lclxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlYnVnZ2VyUGFuZS5kZWJ1Z2dlck1vZGVGaWx0ZXIgPT0gbnVsbCB8fCBkZWJ1Z2dlclBhbmUuZGVidWdnZXJNb2RlRmlsdGVyKG1vZGUpKSB7XG4gICAgICAgICAgaW52YXJpYW50KHRhcmdldENvbnRhaW5lciAhPSBudWxsKVxuICAgICAgICAgIGNvbnN0IHNpemUgPSB0aGlzLl9nZXRTYXZlZERlYnVnZ2VyUGFuZVNpemUodGFyZ2V0RG9jaylcbiAgICAgICAgICB0aGlzLl9hcHBlbmRJdGVtVG9Eb2NrKFxuICAgICAgICAgICAgZGVidWdnZXJQYW5lLFxuICAgICAgICAgICAgdGFyZ2V0Q29udGFpbmVyLFxuICAgICAgICAgICAgbmV3IERlYnVnZ2VyUGFuZVZpZXdNb2RlbChcbiAgICAgICAgICAgICAgZGVidWdnZXJQYW5lLFxuICAgICAgICAgICAgICBkZWJ1Z2dlclBhbmUuaXNMaWZldGltZVZpZXcsXG4gICAgICAgICAgICAgIChwYW5lKSA9PiB0aGlzLl9wYW5lRGVzdHJveWVkKHBhbmUpLFxuICAgICAgICAgICAgICBzaXplXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgYWRkZWRJdGVtc0J5RG9ja1xuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgIHRoaXMuX2RlYnVnZ2VyVmlzaWJsZSA9IHRydWVcblxuICAgIC8vIFJlLWZvY3VzIHRoZSBjb25zb2xlIHBhbmUgYWZ0ZXIgbGF5b3V0IHNvIHRoYXQgaXQgcmVtYWlucyB2aXNpYmxlXG4gICAgLy8gZXZlbiBpZiB3ZSBhZGRlZCBkZWJ1Z2dlciBwYW5lcyB0byB0aGUgY29uc29sZSdzIGRvY2suXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvYXRvbS1hcGlzXG4gICAgYXRvbS53b3Jrc3BhY2Uub3BlbihDT05TT0xFX1ZJRVdfVVJJLCB7IHNlYXJjaEFsbFBhbmVzOiB0cnVlIH0pXG4gIH1cblxuICBfYWRkUGFuZUNvbnRhaW5lclRvV29ya3NwYWNlKFxuICAgIGNvbnRhaW5lcjogYXRvbSRQYW5lQ29udGFpbmVyLFxuICAgIGRvY2s6IGF0b20kQWJzdHJhY3RQYW5lQ29udGFpbmVyLFxuICAgIGFkZGVkSXRlbXNCeURvY2s6IE1hcDxhdG9tJEFic3RyYWN0UGFuZUNvbnRhaW5lciwgbnVtYmVyPixcbiAgICBkb2NrU2l6ZTogP251bWJlclxuICApOiBEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwge1xuICAgIGNvbnN0IGNvbnRhaW5lck1vZGVsID0gbmV3IERlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbChjb250YWluZXIsIGRvY2tTaXplKVxuICAgIHRoaXMuX2FwcGVuZEl0ZW1Ub0RvY2sobnVsbCwgZG9jaywgY29udGFpbmVyTW9kZWwsIGFkZGVkSXRlbXNCeURvY2spXG5cbiAgICByZXR1cm4gY29udGFpbmVyTW9kZWxcbiAgfVxuXG4gIF9nZXRGb2N1c2VkUHJvY2Vzc01vZGUoKTogRGVidWdnZXJNb2RlVHlwZSB7XG4gICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMuX3NlcnZpY2VcbiAgICByZXR1cm4gdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IHZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5kZWJ1Z2dlck1vZGVcbiAgfVxuXG4gIF9wYW5lRGVzdHJveWVkKHBhbmU6IERlYnVnZ2VyUGFuZUNvbmZpZyk6IHZvaWQge1xuICAgIGlmIChwYW5lLmlzTGlmZXRpbWVWaWV3KSB7XG4gICAgICAvLyBMaWZldGltZSB2aWV3cyBhcmUgbm90IGhpZGRlbiBhbmQgcmVtZW1iZXJlZCBsaWtlIHRoZSB1bmltcG9ydGFudCB2aWV3cy5cbiAgICAgIC8vIFRoaXMgdmlldyBiZWluZyBkZXN0cm95ZWQgbWVhbnMgdGhlIGRlYnVnZ2VyIGlzIGV4aXRpbmcgY29tcGxldGVseSwgYW5kXG4gICAgICAvLyB0aGlzIHZpZXcgaXMgbmV2ZXIgcmVtZW1iZXJlZCBhcyBcImhpZGRlbiBieSB0aGUgdXNlclwiIGJlY2F1c2UgaXQncyByZXFpdXJlZFxuICAgICAgLy8gZm9yIHJ1bm5pbmcgdGhlIGRlYnVnZ2VyLlxuICAgICAgY29uc3QgbW9kZSA9IHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzTW9kZSgpXG4gICAgICBpZiAobW9kZSA9PT0gRGVidWdnZXJNb2RlLlJVTk5JTkcgfHwgbW9kZSA9PT0gRGVidWdnZXJNb2RlLlBBVVNFRCkge1xuICAgICAgICB0aGlzLl9zYXZlRGVidWdnZXJQYW5lTG9jYXRpb25zKClcbiAgICAgIH1cblxuICAgICAgdGhpcy5oaWRlRGVidWdnZXJWaWV3cyhmYWxzZSlcblxuICAgICAgZm9yIChjb25zdCBwcm9jZXNzIG9mIHRoaXMuX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRQcm9jZXNzZXMoKSkge1xuICAgICAgICB0aGlzLl9zZXJ2aWNlLnN0b3BQcm9jZXNzKHByb2Nlc3MpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBWaWV3cyBjYW4gYmUgc2VsZWN0aXZlbHkgaGlkZGVuIGJ5IHRoZSB1c2VyIHdoaWxlIHRoZSBkZWJ1Z2dlciBpc1xuICAgIC8vIHJ1bm5pbmcgYW5kIHRoYXQgcHJlZmVyZW5jZSBzaG91bGQgYmUgcmVtZW1iZXJlZC5cbiAgICBjb25zdCBjb25maWcgPSB0aGlzLl9kZWJ1Z2dlclBhbmVzLmZpbmQoKHApID0+IHAudXJpID09PSBwYW5lLnVyaSlcbiAgICBpbnZhcmlhbnQoY29uZmlnICE9IG51bGwpXG5cbiAgICBpZiAoY29uZmlnLnByZXZpb3VzTG9jYXRpb24gPT0gbnVsbCkge1xuICAgICAgY29uZmlnLnByZXZpb3VzTG9jYXRpb24gPSB7XG4gICAgICAgIGRvY2s6IFwiXCIsXG4gICAgICAgIGxheW91dEluZGV4OiAwLFxuICAgICAgICB1c2VySGlkZGVuOiBmYWxzZSxcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY29uZmlnLmlzRW5hYmxlZCA9PSBudWxsIHx8IGNvbmZpZy5pc0VuYWJsZWQoKSkge1xuICAgICAgY29uc3QgbW9kZSA9IHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzTW9kZSgpXG4gICAgICBpZiAoY29uZmlnLmRlYnVnZ2VyTW9kZUZpbHRlciA9PSBudWxsIHx8IGNvbmZpZy5kZWJ1Z2dlck1vZGVGaWx0ZXIobW9kZSkpIHtcbiAgICAgICAgaW52YXJpYW50KGNvbmZpZy5wcmV2aW91c0xvY2F0aW9uICE9IG51bGwpXG4gICAgICAgIGNvbmZpZy5wcmV2aW91c0xvY2F0aW9uLnVzZXJIaWRkZW4gPSB0cnVlXG5cbiAgICAgICAgLy8gU2hvdyBhIG5vdGlmaWNhdGlvbiB0ZWxsaW5nIHRoZSB1c2VyIGhvdyB0byBnZXQgdGhlIHBhbmUgYmFja1xuICAgICAgICAvLyBvbmx5IG9uY2UgcGVyIHNlc3Npb24uXG4gICAgICAgIGlmICghdGhpcy5fcGFuZUhpZGRlbldhcm5pbmdTaG93bikge1xuICAgICAgICAgIHRoaXMuX3BhbmVIaWRkZW5XYXJuaW5nU2hvd24gPSB0cnVlXG5cbiAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkSW5mbyhcbiAgICAgICAgICAgIGAke2NvbmZpZy50aXRsZSgpfSBoYXMgYmVlbiBoaWRkZW4uIFJpZ2h0IGNsaWNrIGFueSBEZWJ1Z2dlciBwYW5lIHRvIGJyaW5nIGl0IGJhY2suYFxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIGhpZGluZyB0aGlzIHZpZXcgbGVmdCBhbiBlbXB0eSBkZWJ1Z2dlciBwYW5lIGNvbnRhaW5lciwgZGVzdHJveSB0aGUgY29udGFpbmVyLlxuICAgIHRoaXMuX2Rlc3Ryb3lDb250YWluZXJJZkVtcHR5KHRoaXMuX2xlZnRQYW5lQ29udGFpbmVyTW9kZWwpXG4gICAgdGhpcy5fZGVzdHJveUNvbnRhaW5lcklmRW1wdHkodGhpcy5fcmlnaHRQYW5lQ29udGFpbmVyTW9kZWwpXG4gIH1cblxuICBfZGVzdHJveUNvbnRhaW5lcklmRW1wdHkoY29udGFpbmVyOiA/RGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsKTogdm9pZCB7XG4gICAgaWYgKGNvbnRhaW5lciAhPSBudWxsICYmIGNvbnRhaW5lci5nZXRBbGxJdGVtcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc3QgcGFyZW50ID0gY29udGFpbmVyLmdldFBhcmVudFBhbmUoKVxuICAgICAgaWYgKHBhcmVudCAhPSBudWxsKSB7XG4gICAgICAgIHBhcmVudC5yZW1vdmVJdGVtKGNvbnRhaW5lcilcbiAgICAgICAgY29udGFpbmVyLmRlc3Ryb3koKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGhpZGVEZWJ1Z2dlclZpZXdzKHBlcmZvcm1pbmdMYXlvdXQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAvLyBEb2NrcyBkbyBub3QgdG9nZ2xlIGNsb3NlZCBhdXRvbWF0aWNhbGx5IHdoZW4gd2UgcmVtb3ZlIGFsbCB0aGVpciBpdGVtcy5cbiAgICAvLyBUaGV5IGNhbiBjb250YWluIHRoaW5ncyBvdGhlciB0aGFuIHRoZSBkZWJ1Z2dlciBpdGVtcyB0aG91Z2gsIGFuZCBjb3VsZFxuICAgIC8vIGhhdmUgYmVlbiBsZWZ0IG9wZW4gYW5kIGVtcHR5IGJ5IHRoZSB1c2VyLiBUb2dnbGUgY2xvc2VkIGFueSBkb2NrcyB0aGF0XG4gICAgLy8gZW5kIHVwIGVtcHR5IG9ubHkgYXMgYSByZXN1bHQgb2YgY2xvc2luZyB0aGUgZGVidWdnZXIuXG4gICAgY29uc3QgZG9ja3MgPSB0aGlzLl9nZXRXb3Jrc3BhY2VEb2NrcygpXG4gICAgY29uc3QgcHJldmlvdXNseUVtcHR5ID0gZG9ja3MubWFwKChkb2NrKSA9PiB0aGlzLl9pc0RvY2tFbXB0eShkb2NrLmRvY2spKVxuXG4gICAgLy8gRmluZCBhbmQgZGVzdHJveSBhbGwgZGVidWdnZXIgaXRlbXMsIGFuZCB0aGUgcGFuZXMgdGhhdCBjb250YWluZWQgdGhlbS5cbiAgICBhdG9tLndvcmtzcGFjZS5nZXRQYW5lcygpLmZvckVhY2goKHBhbmUpID0+IHtcbiAgICAgIHBhbmUuZ2V0SXRlbXMoKS5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lVmlld01vZGVsIHx8IGl0ZW0gaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwpIHtcbiAgICAgICAgICAvLyBSZW1vdmUgdGhlIHZpZXcgbW9kZWwuXG4gICAgICAgICAgaXRlbS5zZXRSZW1vdmVkRnJvbUxheW91dCh0cnVlKVxuICAgICAgICAgIHBhbmUuZGVzdHJveUl0ZW0oaXRlbSlcblxuICAgICAgICAgIC8vIElmIHJlbW92aW5nIHRoZSBtb2RlbCBsZWZ0IGFuIGVtcHR5IHBhbmUsIHJlbW92ZSB0aGUgcGFuZS5cbiAgICAgICAgICBpZiAocGFuZS5nZXRJdGVtcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGFuZS5kZXN0cm95KClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIC8vIElmIGFueSBkb2NrcyBiZWNhbWUgZW1wdHkgYXMgYSByZXN1bHQgb2YgY2xvc2luZyB0aG9zZSBwYW5lcywgaGlkZSB0aGUgZG9jay5cbiAgICBpZiAoIXBlcmZvcm1pbmdMYXlvdXQpIHtcbiAgICAgIGRvY2tzXG4gICAgICAgIC5tYXAoKGRvY2spID0+IHRoaXMuX2lzRG9ja0VtcHR5KGRvY2suZG9jaykpXG4gICAgICAgIC5mb3JFYWNoKChlbXB0eSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoZW1wdHkgJiYgIXByZXZpb3VzbHlFbXB0eVtpbmRleF0pIHtcbiAgICAgICAgICAgIGRvY2tzW2luZGV4XS5kb2NrLmhpZGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fbGVmdFBhbmVDb250YWluZXJNb2RlbCAhPSBudWxsKSB7XG4gICAgICB0aGlzLl9sZWZ0UGFuZUNvbnRhaW5lck1vZGVsLnNldFJlbW92ZWRGcm9tTGF5b3V0KHRydWUpXG4gICAgICBpbnZhcmlhbnQodGhpcy5fbGVmdFBhbmVDb250YWluZXJNb2RlbCAhPSBudWxsKVxuICAgICAgdGhpcy5fbGVmdFBhbmVDb250YWluZXJNb2RlbC5kaXNwb3NlKClcbiAgICAgIHRoaXMuX2xlZnRQYW5lQ29udGFpbmVyTW9kZWwgPSBudWxsXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3JpZ2h0UGFuZUNvbnRhaW5lck1vZGVsICE9IG51bGwpIHtcbiAgICAgIHRoaXMuX3JpZ2h0UGFuZUNvbnRhaW5lck1vZGVsLnNldFJlbW92ZWRGcm9tTGF5b3V0KHRydWUpXG4gICAgICBpbnZhcmlhbnQodGhpcy5fcmlnaHRQYW5lQ29udGFpbmVyTW9kZWwgIT0gbnVsbClcbiAgICAgIHRoaXMuX3JpZ2h0UGFuZUNvbnRhaW5lck1vZGVsLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5fcmlnaHRQYW5lQ29udGFpbmVyTW9kZWwgPSBudWxsXG4gICAgfVxuXG4gICAgdGhpcy5fZGVidWdnZXJWaXNpYmxlID0gZmFsc2VcbiAgfVxuXG4gIGlzRGVidWdnZXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9kZWJ1Z2dlclZpc2libGVcbiAgfVxuXG4gIGdldFdvcmtzcGFjZURvY2tzVmlzaWJpbGl0eSgpOiBBcnJheTxib29sZWFuPiB7XG4gICAgdGhpcy5fc2F2ZURlYnVnZ2VyUGFuZUxvY2F0aW9ucygpXG4gICAgcmV0dXJuIHRoaXMuX2dldFdvcmtzcGFjZURvY2tzKCkubWFwKChkb2NrKSA9PiB7XG4gICAgICByZXR1cm4gZG9jay5kb2NrLmlzVmlzaWJsZSAhPSBudWxsICYmIGRvY2suZG9jay5pc1Zpc2libGUoKVxuICAgIH0pXG4gIH1cbn1cbiJdfQ==