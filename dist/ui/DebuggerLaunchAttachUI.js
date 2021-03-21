"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var React = _interopRequireWildcard(require("react"));

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _Button = require("@atom-ide-community/nuclide-commons-ui/Button");

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _Dropdown = require("@atom-ide-community/nuclide-commons-ui/Dropdown");

var _Tabs = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-ui/Tabs"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _assert = _interopRequireDefault(require("assert"));

var _AtomServiceContainer = require("../AtomServiceContainer");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/* global localStorage */
// TODO those should be managed by the debugger store state
function setLastUsedDebugger(host, action, debuggerDisplayName) {
  const key = "DEBUGGER_LAST_USED_" + host + "_" + action;
  localStorage.setItem(key, debuggerDisplayName);
}

function getLastUsedDebugger(host, action) {
  const key = "DEBUGGER_LAST_USED_" + host + "_" + action;
  return localStorage.getItem(key);
} // Older published debugger packages did not provide `getTabName()`.
// TODO(most): Remove this once newer debugger versions get adoption.


function getTabName(provider) {
  var _provider$_debuggingT;

  if (typeof provider.getTabName === "function") {
    return provider.getTabName();
  }

  return (_provider$_debuggingT = provider._debuggingTypeName) !== null && _provider$_debuggingT !== void 0 ? _provider$_debuggingT : "";
}

class DebuggerLaunchAttachUI extends React.Component {
  constructor(props) {
    super(props);
    this.props = void 0;
    this.state = void 0;
    this._disposables = void 0;

    this._setConfigValid = valid => {
      this.setState({
        configIsValid: valid
      });
    };

    this._disposables = new _UniversalDisposable.default();

    this._disposables.add(atom.commands.add("atom-workspace", {
      "core:confirm": () => {
        if (this.state.configIsValid) {
          this._rememberTab(); // Close the dialog, but do it on the next tick so that the child
          // component gets to handle the event first (and start the debugger).


          process.nextTick(this.props.dialogCloser);
        }
      }
    }), atom.commands.add("atom-workspace", {
      "core:cancel": () => {
        this._rememberTab();

        this.props.dialogCloser();
      }
    }));

    this.state = {
      selectedProviderTab: null,
      configIsValid: false,
      enabledProviders: []
    };
  }

  _rememberTab() {
    // Remember the last tab the user used for this connection when the "launch/attach"
    // button is clicked.
    const host = _nuclideUri.default.isRemote(this.props.connection) ? _nuclideUri.default.getHostname(this.props.connection) : "local";

    if (this.state.selectedProviderTab != null) {
      setLastUsedDebugger(host, this.props.dialogMode, this.state.selectedProviderTab || "");
    }
  }

  UNSAFE_componentWillMount() {
    const host = _nuclideUri.default.isRemote(this.props.connection) ? _nuclideUri.default.getHostname(this.props.connection) : "local";
    const selectedProvider = (this.props.providers.get(host) || []).find(p => getTabName(p) === this.props.initialSelectedTabName);

    if (selectedProvider != null) {
      setLastUsedDebugger(host, this.props.dialogMode, getTabName(selectedProvider));
    }

    this._filterProviders(host);

    this.setState({
      selectedProviderTab: getLastUsedDebugger(host, this.props.dialogMode)
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const host = _nuclideUri.default.isRemote(nextProps.connection) ? _nuclideUri.default.getHostname(nextProps.connection) : "local";

    this._filterProviders(host);

    this.setState({
      selectedProviderTab: getLastUsedDebugger(host, nextProps.dialogMode)
    });
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  async _getProviderIfEnabled(provider) {
    const enabled = await provider.getCallbacksForAction(this.props.dialogMode).isEnabled();
    return enabled ? provider : null;
  }

  _filterProviders(key) {
    this.setState({
      enabledProviders: []
    }); // eslint-disable-next-line nuclide-internal/unused-subscription

    _rxjsCompatUmdMin.Observable.merge(...(this.props.providers.get(key) || []).map(provider => _rxjsCompatUmdMin.Observable.fromPromise(this._getProviderIfEnabled(provider)))).filter(provider => provider != null).map(provider => {
      (0, _assert.default)(provider != null);
      const tabName = getTabName(provider);
      return {
        provider,
        tabName
      };
    }).scan((arr, provider) => arr.concat(provider), []).subscribe(enabledProviders => {
      this.setState({
        enabledProviders
      });
    });
  }

  _getTabsFromEnabledProviders(enabledProviders) {
    const tabs = this.state.enabledProviders.map(debuggerType => ({
      name: debuggerType.tabName,
      tabContent: /*#__PURE__*/React.createElement("span", {
        title: debuggerType.tabName,
        className: "debugger-provider-tab"
      }, debuggerType.tabName)
    })).sort((a, b) => a.name.localeCompare(b.name));
    return tabs;
  }

  setState(partialState, callback) {
    if (typeof partialState === "function") {
      super.setState(partialState, callback);
    } else {
      const fullState = { ...this.state,
        ...partialState
      };

      if (fullState.selectedProviderTab == null) {
        const tabs = this._getTabsFromEnabledProviders(fullState.enabledProviders);

        if (tabs.length > 0) {
          const firstTab = tabs[0];
          fullState.selectedProviderTab = firstTab.name;
        }
      }

      super.setState(fullState, callback);
    }
  }

  render() {
    const tabs = this._getTabsFromEnabledProviders(this.state.enabledProviders);

    let providerContent = null;

    if (tabs.length > 0) {
      let selectedTab = this.state.selectedProviderTab != null ? this.state.selectedProviderTab : this.state.enabledProviders[0].tabName;
      let provider = this.state.enabledProviders.find(p => p.tabName === selectedTab);

      if (provider == null) {
        provider = this.state.enabledProviders[0];
        selectedTab = provider.tabName;
      }

      const defaultConfig = selectedTab != null && selectedTab === this.props.initialSelectedTabName ? this.props.initialProviderConfig : null;
      const debuggerConfigPage = provider.provider.getCallbacksForAction(this.props.dialogMode).getComponent(selectedTab, valid => this._setConfigValid(valid), defaultConfig);
      providerContent = /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(_Tabs.default, {
        className: "debugger-launch-attach-tabs",
        tabs: tabs,
        growable: true,
        activeTabName: this.state.selectedProviderTab,
        triggeringEvent: "onClick",
        onActiveTabChange: newTab => {
          this._setConfigValid(false);

          this.setState({
            selectedProviderTab: newTab.name
          });
        }
      }), /*#__PURE__*/React.createElement("div", {
        className: "debugger-launch-attach-tabcontent"
      }, debuggerConfigPage));
    } else {
      // No debugging providers available.
      providerContent = /*#__PURE__*/React.createElement("div", {
        className: "debugger-launch-attach-tabcontent"
      }, "No debuggers installed, look for available debuggers on", " ", /*#__PURE__*/React.createElement("a", {
        href: "https://atom.io/packages/search?q=atom-ide-debugger-"
      }, "atom.io/packages"));
    }

    return /*#__PURE__*/React.createElement("div", {
      className: "padded debugger-launch-attach-container"
    }, (0, _AtomServiceContainer.isNuclideEnvironment)() ? /*#__PURE__*/React.createElement("h1", {
      className: "debugger-launch-attach-header"
    }, /*#__PURE__*/React.createElement("span", {
      className: "padded"
    }, this.props.dialogMode === "attach" ? "Attach debugger to " : "Launch debugger on "), /*#__PURE__*/React.createElement(_Dropdown.Dropdown, {
      className: "inline",
      options: this.props.connectionOptions,
      onChange: value => this.props.connectionChanged(value),
      size: "xs",
      value: this.props.connection
    })) : null, providerContent, /*#__PURE__*/React.createElement("div", {
      className: "debugger-launch-attach-actions"
    }, /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, null, /*#__PURE__*/React.createElement(_Button.Button, {
      onClick: () => atom.commands.dispatch(atom.views.getView(atom.workspace), "core:cancel")
    }, "Cancel"), /*#__PURE__*/React.createElement(_Button.Button, {
      buttonType: _Button.ButtonTypes.PRIMARY,
      disabled: !this.state.configIsValid,
      onClick: () => atom.commands.dispatch(atom.views.getView(atom.workspace), "core:confirm")
    }, this.props.dialogMode === "attach" ? "Attach" : "Launch"))));
  }

}

exports.default = DebuggerLaunchAttachUI;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyTGF1bmNoQXR0YWNoVUkuanMiXSwibmFtZXMiOlsic2V0TGFzdFVzZWREZWJ1Z2dlciIsImhvc3QiLCJhY3Rpb24iLCJkZWJ1Z2dlckRpc3BsYXlOYW1lIiwia2V5IiwibG9jYWxTdG9yYWdlIiwic2V0SXRlbSIsImdldExhc3RVc2VkRGVidWdnZXIiLCJnZXRJdGVtIiwiZ2V0VGFiTmFtZSIsInByb3ZpZGVyIiwiX2RlYnVnZ2luZ1R5cGVOYW1lIiwiRGVidWdnZXJMYXVuY2hBdHRhY2hVSSIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsInN0YXRlIiwiX2Rpc3Bvc2FibGVzIiwiX3NldENvbmZpZ1ZhbGlkIiwidmFsaWQiLCJzZXRTdGF0ZSIsImNvbmZpZ0lzVmFsaWQiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiYWRkIiwiYXRvbSIsImNvbW1hbmRzIiwiX3JlbWVtYmVyVGFiIiwicHJvY2VzcyIsIm5leHRUaWNrIiwiZGlhbG9nQ2xvc2VyIiwic2VsZWN0ZWRQcm92aWRlclRhYiIsImVuYWJsZWRQcm92aWRlcnMiLCJudWNsaWRlVXJpIiwiaXNSZW1vdGUiLCJjb25uZWN0aW9uIiwiZ2V0SG9zdG5hbWUiLCJkaWFsb2dNb2RlIiwiVU5TQUZFX2NvbXBvbmVudFdpbGxNb3VudCIsInNlbGVjdGVkUHJvdmlkZXIiLCJwcm92aWRlcnMiLCJnZXQiLCJmaW5kIiwicCIsImluaXRpYWxTZWxlY3RlZFRhYk5hbWUiLCJfZmlsdGVyUHJvdmlkZXJzIiwiVU5TQUZFX2NvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHMiLCJuZXh0UHJvcHMiLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJfZ2V0UHJvdmlkZXJJZkVuYWJsZWQiLCJlbmFibGVkIiwiZ2V0Q2FsbGJhY2tzRm9yQWN0aW9uIiwiaXNFbmFibGVkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwibWFwIiwiZnJvbVByb21pc2UiLCJmaWx0ZXIiLCJ0YWJOYW1lIiwic2NhbiIsImFyciIsImNvbmNhdCIsInN1YnNjcmliZSIsIl9nZXRUYWJzRnJvbUVuYWJsZWRQcm92aWRlcnMiLCJ0YWJzIiwiZGVidWdnZXJUeXBlIiwibmFtZSIsInRhYkNvbnRlbnQiLCJzb3J0IiwiYSIsImIiLCJsb2NhbGVDb21wYXJlIiwicGFydGlhbFN0YXRlIiwiY2FsbGJhY2siLCJmdWxsU3RhdGUiLCJsZW5ndGgiLCJmaXJzdFRhYiIsInJlbmRlciIsInByb3ZpZGVyQ29udGVudCIsInNlbGVjdGVkVGFiIiwiZGVmYXVsdENvbmZpZyIsImluaXRpYWxQcm92aWRlckNvbmZpZyIsImRlYnVnZ2VyQ29uZmlnUGFnZSIsImdldENvbXBvbmVudCIsIm5ld1RhYiIsImNvbm5lY3Rpb25PcHRpb25zIiwidmFsdWUiLCJjb25uZWN0aW9uQ2hhbmdlZCIsImRpc3BhdGNoIiwidmlld3MiLCJnZXRWaWV3Iiwid29ya3NwYWNlIiwiQnV0dG9uVHlwZXMiLCJQUklNQVJZIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBS0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBZEE7QUE0Q0E7QUFDQSxTQUFTQSxtQkFBVCxDQUE2QkMsSUFBN0IsRUFBMkNDLE1BQTNDLEVBQXlFQyxtQkFBekUsRUFBNEc7QUFDMUcsUUFBTUMsR0FBRyxHQUFHLHdCQUF3QkgsSUFBeEIsR0FBK0IsR0FBL0IsR0FBcUNDLE1BQWpEO0FBQ0FHLEVBQUFBLFlBQVksQ0FBQ0MsT0FBYixDQUFxQkYsR0FBckIsRUFBMEJELG1CQUExQjtBQUNEOztBQUVELFNBQVNJLG1CQUFULENBQTZCTixJQUE3QixFQUEyQ0MsTUFBM0MsRUFBa0Y7QUFDaEYsUUFBTUUsR0FBRyxHQUFHLHdCQUF3QkgsSUFBeEIsR0FBK0IsR0FBL0IsR0FBcUNDLE1BQWpEO0FBQ0EsU0FBT0csWUFBWSxDQUFDRyxPQUFiLENBQXFCSixHQUFyQixDQUFQO0FBQ0QsQyxDQUVEO0FBQ0E7OztBQUNB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LE9BQU8sRUFBRSxNQUFNRyxJQUFJLENBQUNDLFFBQUwsQ0FBYytELFFBQWQsQ0FBdUJoRSxJQUFJLENBQUNpRSxLQUFMLENBQVdDLE9BQVgsQ0FBbUJsRSxJQUFJLENBQUNtRSxTQUF4QixDQUF2QixFQUEyRCxjQUEzRDtBQUhqQixPQUtHLEtBQUs1RSxLQUFMLENBQVdxQixVQUFYLEtBQTBCLFFBQTFCLEdBQXFDLFFBQXJDLEdBQWdELFFBTG5ELENBSkYsQ0FERixDQWhCRixDQURGO0FBaUNEOztBQS9OK0UiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBnbG9iYWwgbG9jYWxTdG9yYWdlICovXG5cbmltcG9ydCB0eXBlIHsgRGVidWdnZXJDb25maWdBY3Rpb24sIERlYnVnZ2VyTGF1bmNoQXR0YWNoUHJvdmlkZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXG5pbXBvcnQgdHlwZSB7IFRhYiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UYWJzXCJcblxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCBudWNsaWRlVXJpIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uVHlwZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQnV0dG9uXCJcbmltcG9ydCB7IEJ1dHRvbkdyb3VwIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvbkdyb3VwXCJcbmltcG9ydCB7IERyb3Bkb3duIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0Ryb3Bkb3duXCJcbmltcG9ydCBUYWJzIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UYWJzXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXG5pbXBvcnQgeyBpc051Y2xpZGVFbnZpcm9ubWVudCB9IGZyb20gXCIuLi9BdG9tU2VydmljZUNvbnRhaW5lclwiXG5cbnR5cGUgQ29ubmVjdGlvbk9wdGlvbiA9IHtcbiAgdmFsdWU6IHN0cmluZyxcbiAgbGFiZWw6IHN0cmluZyxcbn1cblxudHlwZSBFbmFibGVkUHJvdmlkZXIgPSB7XG4gIHByb3ZpZGVyOiBEZWJ1Z2dlckxhdW5jaEF0dGFjaFByb3ZpZGVyLFxuICB0YWJOYW1lOiBzdHJpbmcsXG59XG5cbnR5cGUgUHJvcHMgPSB7XG4gICtkaWFsb2dNb2RlOiBEZWJ1Z2dlckNvbmZpZ0FjdGlvbixcbiAgK2luaXRpYWxTZWxlY3RlZFRhYk5hbWU6ID9zdHJpbmcsXG4gICtpbml0aWFsUHJvdmlkZXJDb25maWc6ID97IFtzdHJpbmddOiBtaXhlZCB9LFxuICArY29ubmVjdGlvbjogc3RyaW5nLFxuICArY29ubmVjdGlvbkNoYW5nZWQ6IChuZXdWYWx1ZTogP3N0cmluZykgPT4gdm9pZCxcbiAgLy8gJEZsb3dGaXhNZVxuICArY29ubmVjdGlvbk9wdGlvbnM6IEFycmF5PENvbm5lY3Rpb25PcHRpb24+LFxuICArcHJvdmlkZXJzOiBNYXA8c3RyaW5nLCBBcnJheTxEZWJ1Z2dlckxhdW5jaEF0dGFjaFByb3ZpZGVyPj4sXG4gICtkaWFsb2dDbG9zZXI6ICgpID0+IHZvaWQsXG59XG5cbnR5cGUgU3RhdGUgPSB7XG4gIHNlbGVjdGVkUHJvdmlkZXJUYWI6ID9zdHJpbmcsXG4gIGNvbmZpZ0lzVmFsaWQ6IGJvb2xlYW4sXG4gIGVuYWJsZWRQcm92aWRlcnM6IEFycmF5PEVuYWJsZWRQcm92aWRlcj4sXG59XG5cbi8vIFRPRE8gdGhvc2Ugc2hvdWxkIGJlIG1hbmFnZWQgYnkgdGhlIGRlYnVnZ2VyIHN0b3JlIHN0YXRlXG5mdW5jdGlvbiBzZXRMYXN0VXNlZERlYnVnZ2VyKGhvc3Q6IHN0cmluZywgYWN0aW9uOiBEZWJ1Z2dlckNvbmZpZ0FjdGlvbiwgZGVidWdnZXJEaXNwbGF5TmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IFwiREVCVUdHRVJfTEFTVF9VU0VEX1wiICsgaG9zdCArIFwiX1wiICsgYWN0aW9uXG4gIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgZGVidWdnZXJEaXNwbGF5TmFtZSlcbn1cblxuZnVuY3Rpb24gZ2V0TGFzdFVzZWREZWJ1Z2dlcihob3N0OiBzdHJpbmcsIGFjdGlvbjogRGVidWdnZXJDb25maWdBY3Rpb24pOiA/c3RyaW5nIHtcbiAgY29uc3Qga2V5ID0gXCJERUJVR0dFUl9MQVNUX1VTRURfXCIgKyBob3N0ICsgXCJfXCIgKyBhY3Rpb25cbiAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSlcbn1cblxuLy8gT2xkZXIgcHVibGlzaGVkIGRlYnVnZ2VyIHBhY2thZ2VzIGRpZCBub3QgcHJvdmlkZSBgZ2V0VGFiTmFtZSgpYC5cbi8vIFRPRE8obW9zdCk6IFJlbW92ZSB0aGlzIG9uY2UgbmV3ZXIgZGVidWdnZXIgdmVyc2lvbnMgZ2V0IGFkb3B0aW9uLlxuZnVuY3Rpb24gZ2V0VGFiTmFtZShwcm92aWRlcjogRGVidWdnZXJMYXVuY2hBdHRhY2hQcm92aWRlcik6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgcHJvdmlkZXIuZ2V0VGFiTmFtZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHByb3ZpZGVyLmdldFRhYk5hbWUoKVxuICB9XG4gIHJldHVybiBwcm92aWRlci5fZGVidWdnaW5nVHlwZU5hbWUgPz8gXCJcIlxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z2dlckxhdW5jaEF0dGFjaFVJIGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFByb3BzLCBTdGF0ZT4ge1xuICBwcm9wczogUHJvcHNcbiAgc3RhdGU6IFN0YXRlXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XG4gICAgICAgIFwiY29yZTpjb25maXJtXCI6ICgpID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5zdGF0ZS5jb25maWdJc1ZhbGlkKSB7XG4gICAgICAgICAgICB0aGlzLl9yZW1lbWJlclRhYigpXG5cbiAgICAgICAgICAgIC8vIENsb3NlIHRoZSBkaWFsb2csIGJ1dCBkbyBpdCBvbiB0aGUgbmV4dCB0aWNrIHNvIHRoYXQgdGhlIGNoaWxkXG4gICAgICAgICAgICAvLyBjb21wb25lbnQgZ2V0cyB0byBoYW5kbGUgdGhlIGV2ZW50IGZpcnN0IChhbmQgc3RhcnQgdGhlIGRlYnVnZ2VyKS5cbiAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2sodGhpcy5wcm9wcy5kaWFsb2dDbG9zZXIpXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgICAgXCJjb3JlOmNhbmNlbFwiOiAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5fcmVtZW1iZXJUYWIoKVxuICAgICAgICAgIHRoaXMucHJvcHMuZGlhbG9nQ2xvc2VyKClcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgIHNlbGVjdGVkUHJvdmlkZXJUYWI6IG51bGwsXG4gICAgICBjb25maWdJc1ZhbGlkOiBmYWxzZSxcbiAgICAgIGVuYWJsZWRQcm92aWRlcnM6IFtdLFxuICAgIH1cbiAgfVxuXG4gIF9yZW1lbWJlclRhYigpOiB2b2lkIHtcbiAgICAvLyBSZW1lbWJlciB0aGUgbGFzdCB0YWIgdGhlIHVzZXIgdXNlZCBmb3IgdGhpcyBjb25uZWN0aW9uIHdoZW4gdGhlIFwibGF1bmNoL2F0dGFjaFwiXG4gICAgLy8gYnV0dG9uIGlzIGNsaWNrZWQuXG4gICAgY29uc3QgaG9zdCA9IG51Y2xpZGVVcmkuaXNSZW1vdGUodGhpcy5wcm9wcy5jb25uZWN0aW9uKSA/IG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUodGhpcy5wcm9wcy5jb25uZWN0aW9uKSA6IFwibG9jYWxcIlxuICAgIGlmICh0aGlzLnN0YXRlLnNlbGVjdGVkUHJvdmlkZXJUYWIgIT0gbnVsbCkge1xuICAgICAgc2V0TGFzdFVzZWREZWJ1Z2dlcihob3N0LCB0aGlzLnByb3BzLmRpYWxvZ01vZGUsIHRoaXMuc3RhdGUuc2VsZWN0ZWRQcm92aWRlclRhYiB8fCBcIlwiKVxuICAgIH1cbiAgfVxuXG4gIFVOU0FGRV9jb21wb25lbnRXaWxsTW91bnQoKSB7XG4gICAgY29uc3QgaG9zdCA9IG51Y2xpZGVVcmkuaXNSZW1vdGUodGhpcy5wcm9wcy5jb25uZWN0aW9uKSA/IG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUodGhpcy5wcm9wcy5jb25uZWN0aW9uKSA6IFwibG9jYWxcIlxuXG4gICAgY29uc3Qgc2VsZWN0ZWRQcm92aWRlciA9ICh0aGlzLnByb3BzLnByb3ZpZGVycy5nZXQoaG9zdCkgfHwgW10pLmZpbmQoXG4gICAgICAocCkgPT4gZ2V0VGFiTmFtZShwKSA9PT0gdGhpcy5wcm9wcy5pbml0aWFsU2VsZWN0ZWRUYWJOYW1lXG4gICAgKVxuICAgIGlmIChzZWxlY3RlZFByb3ZpZGVyICE9IG51bGwpIHtcbiAgICAgIHNldExhc3RVc2VkRGVidWdnZXIoaG9zdCwgdGhpcy5wcm9wcy5kaWFsb2dNb2RlLCBnZXRUYWJOYW1lKHNlbGVjdGVkUHJvdmlkZXIpKVxuICAgIH1cbiAgICB0aGlzLl9maWx0ZXJQcm92aWRlcnMoaG9zdClcbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIHNlbGVjdGVkUHJvdmlkZXJUYWI6IGdldExhc3RVc2VkRGVidWdnZXIoaG9zdCwgdGhpcy5wcm9wcy5kaWFsb2dNb2RlKSxcbiAgICB9KVxuICB9XG5cbiAgVU5TQUZFX2NvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHMobmV4dFByb3BzOiBQcm9wcykge1xuICAgIGNvbnN0IGhvc3QgPSBudWNsaWRlVXJpLmlzUmVtb3RlKG5leHRQcm9wcy5jb25uZWN0aW9uKSA/IG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUobmV4dFByb3BzLmNvbm5lY3Rpb24pIDogXCJsb2NhbFwiXG5cbiAgICB0aGlzLl9maWx0ZXJQcm92aWRlcnMoaG9zdClcbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIHNlbGVjdGVkUHJvdmlkZXJUYWI6IGdldExhc3RVc2VkRGVidWdnZXIoaG9zdCwgbmV4dFByb3BzLmRpYWxvZ01vZGUpLFxuICAgIH0pXG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIGFzeW5jIF9nZXRQcm92aWRlcklmRW5hYmxlZChwcm92aWRlcjogRGVidWdnZXJMYXVuY2hBdHRhY2hQcm92aWRlcik6IFByb21pc2U8P0RlYnVnZ2VyTGF1bmNoQXR0YWNoUHJvdmlkZXI+IHtcbiAgICBjb25zdCBlbmFibGVkID0gYXdhaXQgcHJvdmlkZXIuZ2V0Q2FsbGJhY2tzRm9yQWN0aW9uKHRoaXMucHJvcHMuZGlhbG9nTW9kZSkuaXNFbmFibGVkKClcbiAgICByZXR1cm4gZW5hYmxlZCA/IHByb3ZpZGVyIDogbnVsbFxuICB9XG5cbiAgX2ZpbHRlclByb3ZpZGVycyhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgZW5hYmxlZFByb3ZpZGVyczogW10sXG4gICAgfSlcblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL3VudXNlZC1zdWJzY3JpcHRpb25cbiAgICBPYnNlcnZhYmxlLm1lcmdlKFxuICAgICAgLi4uKHRoaXMucHJvcHMucHJvdmlkZXJzLmdldChrZXkpIHx8IFtdKS5tYXAoKHByb3ZpZGVyKSA9PlxuICAgICAgICBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHRoaXMuX2dldFByb3ZpZGVySWZFbmFibGVkKHByb3ZpZGVyKSlcbiAgICAgIClcbiAgICApXG4gICAgICAuZmlsdGVyKChwcm92aWRlcikgPT4gcHJvdmlkZXIgIT0gbnVsbClcbiAgICAgIC5tYXAoKHByb3ZpZGVyKSA9PiB7XG4gICAgICAgIGludmFyaWFudChwcm92aWRlciAhPSBudWxsKVxuICAgICAgICBjb25zdCB0YWJOYW1lID0gZ2V0VGFiTmFtZShwcm92aWRlcilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgICB0YWJOYW1lLFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnNjYW4oKGFyciwgcHJvdmlkZXIpID0+IGFyci5jb25jYXQocHJvdmlkZXIpLCBbXSlcbiAgICAgIC5zdWJzY3JpYmUoKGVuYWJsZWRQcm92aWRlcnMpID0+IHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7IGVuYWJsZWRQcm92aWRlcnMgfSlcbiAgICAgIH0pXG4gIH1cblxuICBfc2V0Q29uZmlnVmFsaWQgPSAodmFsaWQ6IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIGNvbmZpZ0lzVmFsaWQ6IHZhbGlkLFxuICAgIH0pXG4gIH1cblxuICBfZ2V0VGFic0Zyb21FbmFibGVkUHJvdmlkZXJzKGVuYWJsZWRQcm92aWRlcnM6IEVuYWJsZWRQcm92aWRlcltdKTogVGFiW10ge1xuICAgIGNvbnN0IHRhYnMgPSB0aGlzLnN0YXRlLmVuYWJsZWRQcm92aWRlcnNcbiAgICAgIC5tYXAoKGRlYnVnZ2VyVHlwZSkgPT4gKHtcbiAgICAgICAgbmFtZTogZGVidWdnZXJUeXBlLnRhYk5hbWUsXG4gICAgICAgIHRhYkNvbnRlbnQ6IChcbiAgICAgICAgICA8c3BhbiB0aXRsZT17ZGVidWdnZXJUeXBlLnRhYk5hbWV9IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXByb3ZpZGVyLXRhYlwiPlxuICAgICAgICAgICAge2RlYnVnZ2VyVHlwZS50YWJOYW1lfVxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgKSxcbiAgICAgIH0pKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpXG4gICAgcmV0dXJuIHRhYnNcbiAgfVxuXG4gIHNldFN0YXRlKHBhcnRpYWxTdGF0ZTogJFNoYXBlPFN0YXRlPiB8ICgoU3RhdGUsIFByb3BzKSA9PiAkU2hhcGU8U3RhdGU+IHwgdm9pZCksIGNhbGxiYWNrPzogKCkgPT4gbWl4ZWQpOiB2b2lkIHtcbiAgICBpZiAodHlwZW9mIHBhcnRpYWxTdGF0ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBzdXBlci5zZXRTdGF0ZShwYXJ0aWFsU3RhdGUsIGNhbGxiYWNrKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmdWxsU3RhdGUgPSB7XG4gICAgICAgIC4uLnRoaXMuc3RhdGUsXG4gICAgICAgIC4uLnBhcnRpYWxTdGF0ZSxcbiAgICAgIH1cbiAgICAgIGlmIChmdWxsU3RhdGUuc2VsZWN0ZWRQcm92aWRlclRhYiA9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSB0aGlzLl9nZXRUYWJzRnJvbUVuYWJsZWRQcm92aWRlcnMoZnVsbFN0YXRlLmVuYWJsZWRQcm92aWRlcnMpXG4gICAgICAgIGlmICh0YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF1cbiAgICAgICAgICBmdWxsU3RhdGUuc2VsZWN0ZWRQcm92aWRlclRhYiA9IGZpcnN0VGFiLm5hbWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc3VwZXIuc2V0U3RhdGUoZnVsbFN0YXRlLCBjYWxsYmFjaylcbiAgICB9XG4gIH1cblxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XG4gICAgY29uc3QgdGFicyA9IHRoaXMuX2dldFRhYnNGcm9tRW5hYmxlZFByb3ZpZGVycyh0aGlzLnN0YXRlLmVuYWJsZWRQcm92aWRlcnMpXG4gICAgbGV0IHByb3ZpZGVyQ29udGVudCA9IG51bGxcbiAgICBpZiAodGFicy5sZW5ndGggPiAwKSB7XG4gICAgICBsZXQgc2VsZWN0ZWRUYWIgPVxuICAgICAgICB0aGlzLnN0YXRlLnNlbGVjdGVkUHJvdmlkZXJUYWIgIT0gbnVsbCA/IHRoaXMuc3RhdGUuc2VsZWN0ZWRQcm92aWRlclRhYiA6IHRoaXMuc3RhdGUuZW5hYmxlZFByb3ZpZGVyc1swXS50YWJOYW1lXG4gICAgICBsZXQgcHJvdmlkZXIgPSB0aGlzLnN0YXRlLmVuYWJsZWRQcm92aWRlcnMuZmluZCgocCkgPT4gcC50YWJOYW1lID09PSBzZWxlY3RlZFRhYilcbiAgICAgIGlmIChwcm92aWRlciA9PSBudWxsKSB7XG4gICAgICAgIHByb3ZpZGVyID0gdGhpcy5zdGF0ZS5lbmFibGVkUHJvdmlkZXJzWzBdXG4gICAgICAgIHNlbGVjdGVkVGFiID0gcHJvdmlkZXIudGFiTmFtZVxuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWZhdWx0Q29uZmlnID1cbiAgICAgICAgc2VsZWN0ZWRUYWIgIT0gbnVsbCAmJiBzZWxlY3RlZFRhYiA9PT0gdGhpcy5wcm9wcy5pbml0aWFsU2VsZWN0ZWRUYWJOYW1lXG4gICAgICAgICAgPyB0aGlzLnByb3BzLmluaXRpYWxQcm92aWRlckNvbmZpZ1xuICAgICAgICAgIDogbnVsbFxuXG4gICAgICBjb25zdCBkZWJ1Z2dlckNvbmZpZ1BhZ2UgPSBwcm92aWRlci5wcm92aWRlclxuICAgICAgICAuZ2V0Q2FsbGJhY2tzRm9yQWN0aW9uKHRoaXMucHJvcHMuZGlhbG9nTW9kZSlcbiAgICAgICAgLmdldENvbXBvbmVudChzZWxlY3RlZFRhYiwgKHZhbGlkKSA9PiB0aGlzLl9zZXRDb25maWdWYWxpZCh2YWxpZCksIGRlZmF1bHRDb25maWcpXG5cbiAgICAgIHByb3ZpZGVyQ29udGVudCA9IChcbiAgICAgICAgPGRpdj5cbiAgICAgICAgICA8VGFic1xuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItbGF1bmNoLWF0dGFjaC10YWJzXCJcbiAgICAgICAgICAgIHRhYnM9e3RhYnN9XG4gICAgICAgICAgICBncm93YWJsZT17dHJ1ZX1cbiAgICAgICAgICAgIGFjdGl2ZVRhYk5hbWU9e3RoaXMuc3RhdGUuc2VsZWN0ZWRQcm92aWRlclRhYn1cbiAgICAgICAgICAgIHRyaWdnZXJpbmdFdmVudD1cIm9uQ2xpY2tcIlxuICAgICAgICAgICAgb25BY3RpdmVUYWJDaGFuZ2U9eyhuZXdUYWIpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5fc2V0Q29uZmlnVmFsaWQoZmFsc2UpXG4gICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoeyBzZWxlY3RlZFByb3ZpZGVyVGFiOiBuZXdUYWIubmFtZSB9KVxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItbGF1bmNoLWF0dGFjaC10YWJjb250ZW50XCI+e2RlYnVnZ2VyQ29uZmlnUGFnZX08L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE5vIGRlYnVnZ2luZyBwcm92aWRlcnMgYXZhaWxhYmxlLlxuICAgICAgcHJvdmlkZXJDb250ZW50ID0gKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLWxhdW5jaC1hdHRhY2gtdGFiY29udGVudFwiPlxuICAgICAgICAgIE5vIGRlYnVnZ2VycyBpbnN0YWxsZWQsIGxvb2sgZm9yIGF2YWlsYWJsZSBkZWJ1Z2dlcnMgb257XCIgXCJ9XG4gICAgICAgICAgPGEgaHJlZj1cImh0dHBzOi8vYXRvbS5pby9wYWNrYWdlcy9zZWFyY2g/cT1hdG9tLWlkZS1kZWJ1Z2dlci1cIj5hdG9tLmlvL3BhY2thZ2VzPC9hPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIClcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJwYWRkZWQgZGVidWdnZXItbGF1bmNoLWF0dGFjaC1jb250YWluZXJcIj5cbiAgICAgICAge2lzTnVjbGlkZUVudmlyb25tZW50KCkgPyAoXG4gICAgICAgICAgPGgxIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWxhdW5jaC1hdHRhY2gtaGVhZGVyXCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJwYWRkZWRcIj5cbiAgICAgICAgICAgICAge3RoaXMucHJvcHMuZGlhbG9nTW9kZSA9PT0gXCJhdHRhY2hcIiA/IFwiQXR0YWNoIGRlYnVnZ2VyIHRvIFwiIDogXCJMYXVuY2ggZGVidWdnZXIgb24gXCJ9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8RHJvcGRvd25cbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiaW5saW5lXCJcbiAgICAgICAgICAgICAgb3B0aW9ucz17dGhpcy5wcm9wcy5jb25uZWN0aW9uT3B0aW9uc31cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZTogP3N0cmluZykgPT4gdGhpcy5wcm9wcy5jb25uZWN0aW9uQ2hhbmdlZCh2YWx1ZSl9XG4gICAgICAgICAgICAgIHNpemU9XCJ4c1wiXG4gICAgICAgICAgICAgIHZhbHVlPXt0aGlzLnByb3BzLmNvbm5lY3Rpb259XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvaDE+XG4gICAgICAgICkgOiBudWxsfVxuICAgICAgICB7cHJvdmlkZXJDb250ZW50fVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLWxhdW5jaC1hdHRhY2gtYWN0aW9uc1wiPlxuICAgICAgICAgIDxCdXR0b25Hcm91cD5cbiAgICAgICAgICAgIDxCdXR0b24gb25DbGljaz17KCkgPT4gYXRvbS5jb21tYW5kcy5kaXNwYXRjaChhdG9tLnZpZXdzLmdldFZpZXcoYXRvbS53b3Jrc3BhY2UpLCBcImNvcmU6Y2FuY2VsXCIpfT5cbiAgICAgICAgICAgICAgQ2FuY2VsXG4gICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgYnV0dG9uVHlwZT17QnV0dG9uVHlwZXMuUFJJTUFSWX1cbiAgICAgICAgICAgICAgZGlzYWJsZWQ9eyF0aGlzLnN0YXRlLmNvbmZpZ0lzVmFsaWR9XG4gICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJjb3JlOmNvbmZpcm1cIil9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIHt0aGlzLnByb3BzLmRpYWxvZ01vZGUgPT09IFwiYXR0YWNoXCIgPyBcIkF0dGFjaFwiIDogXCJMYXVuY2hcIn1cbiAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgIDwvQnV0dG9uR3JvdXA+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=