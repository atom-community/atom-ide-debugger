"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _AtomInput = require("@atom-ide-community/nuclide-commons-ui/AtomInput");

var _event = require("@atom-ide-community/nuclide-commons/event");

var React = _interopRequireWildcard(require("react"));

var _Tree = require("@atom-ide-community/nuclide-commons-ui/Tree");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var _ProcessTreeNode = _interopRequireDefault(require("./ProcessTreeNode"));

var _Button = require("@atom-ide-community/nuclide-commons-ui/Button");

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _featureConfig = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-atom/feature-config"));

var _DebuggerAddTargetButton = require("./DebuggerAddTargetButton");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const SHOW_PAUSED_ONLY_KEY = "debugger-show-paused-threads-only";

class DebuggerProcessComponent extends React.PureComponent {
  constructor(props) {
    super(props);
    this._disposables = void 0;
    this._disposables = new _UniversalDisposable.default();
    this.state = {
      processList: this.props.service.getModel().getProcesses(),
      filter: null,
      showPausedThreadsOnly: Boolean(_featureConfig.default.get(SHOW_PAUSED_ONLY_KEY))
    };
  }

  componentDidMount() {
    const {
      service
    } = this.props;
    const model = service.getModel();

    this._disposables.add((0, _event.observableFromSubscribeFunction)(model.onDidChangeProcesses.bind(model)).let((0, _observable.fastDebounce)(150)).subscribe(() => {
      this.setState({
        processList: model.getProcesses()
      });
    }));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  render() {
    const {
      processList,
      filter
    } = this.state;
    const {
      service
    } = this.props;
    let filterRegEx = null;

    try {
      if (filter != null) {
        filterRegEx = new RegExp(filter, "ig");
      }
    } catch (_) {}

    const processElements = processList.map((process, processIndex) => {
      const {
        adapterType,
        processName
      } = process.configuration;
      return process == null ? "No processes are currently being debugged" : /*#__PURE__*/React.createElement(_ProcessTreeNode.default, {
        title: processName != null ? processName : adapterType,
        filter: filter,
        filterRegEx: filterRegEx,
        showPausedThreadsOnly: this.state.showPausedThreadsOnly,
        key: process.getId(),
        childItems: process.getAllThreads(),
        process: process,
        service: service
      });
    });
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "debugger-thread-filter-row"
    }, /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
      className: "debugger-thread-filter-box",
      placeholderText: "Filter threads...",
      value: this.state.filter || "",
      size: "sm",
      onDidChange: text => {
        this.setState({
          filter: text
        });
      },
      autofocus: false
    }), /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
      className: "inline-block"
    }, /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "playback-pause",
      size: _Button.ButtonSizes.SMALL,
      selected: this.state.showPausedThreadsOnly,
      onClick: () => {
        _featureConfig.default.set(SHOW_PAUSED_ONLY_KEY, !this.state.showPausedThreadsOnly);

        this.setState(prevState => ({
          showPausedThreadsOnly: !prevState.showPausedThreadsOnly
        }));
      },
      tooltip: {
        title: "Show only paused threads"
      }
    }), /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "x",
      disabled: !this.state.showPausedThreadsOnly && (this.state.filter === "" || this.state.filter == null),
      size: _Button.ButtonSizes.SMALL,
      onClick: () => {
        _featureConfig.default.set(SHOW_PAUSED_ONLY_KEY, false);

        this.setState({
          showPausedThreadsOnly: false,
          filter: ""
        });
      },
      tooltip: {
        title: "Clear thread filters"
      }
    })), (0, _DebuggerAddTargetButton.AddTargetButton)("debugger-stepping-buttongroup")), /*#__PURE__*/React.createElement(_Tree.TreeList, {
      showArrows: true
    }, processElements));
  }

}

exports.default = DebuggerProcessComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyUHJvY2Vzc0NvbXBvbmVudC5qcyJdLCJuYW1lcyI6WyJTSE9XX1BBVVNFRF9PTkxZX0tFWSIsIkRlYnVnZ2VyUHJvY2Vzc0NvbXBvbmVudCIsIlJlYWN0IiwiUHVyZUNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJfZGlzcG9zYWJsZXMiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwic3RhdGUiLCJwcm9jZXNzTGlzdCIsInNlcnZpY2UiLCJnZXRNb2RlbCIsImdldFByb2Nlc3NlcyIsImZpbHRlciIsInNob3dQYXVzZWRUaHJlYWRzT25seSIsIkJvb2xlYW4iLCJmZWF0dXJlQ29uZmlnIiwiZ2V0IiwiY29tcG9uZW50RGlkTW91bnQiLCJtb2RlbCIsImFkZCIsIm9uRGlkQ2hhbmdlUHJvY2Vzc2VzIiwiYmluZCIsImxldCIsInN1YnNjcmliZSIsInNldFN0YXRlIiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJkaXNwb3NlIiwicmVuZGVyIiwiZmlsdGVyUmVnRXgiLCJSZWdFeHAiLCJfIiwicHJvY2Vzc0VsZW1lbnRzIiwibWFwIiwicHJvY2VzcyIsInByb2Nlc3NJbmRleCIsImFkYXB0ZXJUeXBlIiwicHJvY2Vzc05hbWUiLCJjb25maWd1cmF0aW9uIiwiZ2V0SWQiLCJnZXRBbGxUaHJlYWRzIiwidGV4dCIsIkJ1dHRvblNpemVzIiwiU01BTEwiLCJzZXQiLCJwcmV2U3RhdGUiLCJ0aXRsZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQVlBLE1BQU1BLG9CQUFvQixHQUFHLG1DQUE3Qjs7QUFFZSxNQUFNQyx3QkFBTixTQUF1Q0MsS0FBSyxDQUFDQyxhQUE3QyxDQUF5RTtBQUd0RkMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUYxQkMsWUFFMEI7QUFHeEIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNBLFNBQUtDLEtBQUwsR0FBYTtBQUNYQyxNQUFBQSxXQUFXLEVBQUUsS0FBS0osS0FBTCxDQUFXSyxPQUFYLENBQW1CQyxRQUFuQixHQUE4QkMsWUFBOUIsRUFERjtBQUVYQyxNQUFBQSxNQUFNLEVBQUUsSUFGRztBQUdYQyxNQUFBQSxxQkFBcUIsRUFBRUMsT0FBTyxDQUFDQyx1QkFBY0MsR0FBZCxDQUFrQmpCLG9CQUFsQixDQUFEO0FBSG5CLEtBQWI7QUFLRDs7QUFFRGtCLEVBQUFBLGlCQUFpQixHQUFTO0FBQ3hCLFVBQU07QUFBRVIsTUFBQUE7QUFBRixRQUFjLEtBQUtMLEtBQXpCO0FBQ0EsVUFBTWMsS0FBSyxHQUFHVCxPQUFPLENBQUNDLFFBQVIsRUFBZDs7QUFDQSxTQUFLTCxZQUFMLENBQWtCYyxHQUFsQixDQUNFLDRDQUFnQ0QsS0FBSyxDQUFDRSxvQkFBTixDQUEyQkMsSUFBM0IsQ0FBZ0NILEtBQWhDLENBQWhDLEVBQ0dJLEdBREgsQ0FDTyw4QkFBYSxHQUFiLENBRFAsRUFFR0MsU0FGSCxDQUVhLE1BQU07QUFDZixXQUFLQyxRQUFMLENBQWM7QUFDWmhCLFFBQUFBLFdBQVcsRUFBRVUsS0FBSyxDQUFDUCxZQUFOO0FBREQsT0FBZDtBQUdELEtBTkgsQ0FERjtBQVNEOztBQUVEYyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLcEIsWUFBTCxDQUFrQnFCLE9BQWxCO0FBQ0Q7O0FBRURDLEVBQUFBLE1BQU0sR0FBZTtBQUNuQixVQUFNO0FBQUVuQixNQUFBQSxXQUFGO0FBQWVJLE1BQUFBO0FBQWYsUUFBMEIsS0FBS0wsS0FBckM7QUFDQSxVQUFNO0FBQUVFLE1BQUFBO0FBQUYsUUFBYyxLQUFLTCxLQUF6QjtBQUNBLFFBQUl3QixXQUFXLEdBQUcsSUFBbEI7O0FBQ0EsUUFBSTtBQUNGLFVBQUloQixNQUFNLElBQUksSUFBZCxFQUFvQjtBQUNsQmdCLFFBQUFBLFdBQVcsR0FBRyxJQUFJQyxNQUFKLENBQVdqQixNQUFYLEVBQW1CLElBQW5CLENBQWQ7QUFDRDtBQUNGLEtBSkQsQ0FJRSxPQUFPa0IsQ0FBUCxFQUFVLENBQUU7O0FBQ2QsVUFBTUMsZUFBZSxHQUFHdkIsV0FBVyxDQUFDd0IsR0FBWixDQUFnQixDQUFDQyxPQUFELEVBQVVDLFlBQVYsS0FBMkI7QUFDakUsWUFBTTtBQUFFQyxRQUFBQSxXQUFGO0FBQWVDLFFBQUFBO0FBQWYsVUFBK0JILE9BQU8sQ0FBQ0ksYUFBN0M7QUFDQSxhQUFPSixPQUFPLElBQUksSUFBWCxHQUNMLDJDQURLLGdCQUdMLG9CQUFDLHdCQUFEO0FBQ0UsUUFBQSxLQUFLLEVBQUVHLFdBQVcsSUFBSSxJQUFmLEdBQXNCQSxXQUF0QixHQUFvQ0QsV0FEN0M7QUFFRSxRQUFBLE1BQU0sRUFBRXZCLE1BRlY7QUFHRSxRQUFBLFdBQVcsRUFBRWdCLFdBSGY7QUFJRSxRQUFBLHFCQUFxQixFQUFFLEtBQUtyQixLQUFMLENBQVdNLHFCQUpwQztBQUtFLFFBQUEsR0FBRyxFQUFFb0IsT0FBTyxDQUFDSyxLQUFSLEVBTFA7QUFNRSxRQUFBLFVBQVUsRUFBRUwsT0FBTyxDQUFDTSxhQUFSLEVBTmQ7QUFPRSxRQUFBLE9BQU8sRUFBRU4sT0FQWDtBQVFFLFFBQUEsT0FBTyxFQUFFeEI7QUFSWCxRQUhGO0FBY0QsS0FoQnVCLENBQXhCO0FBa0JBLHdCQUNFLDhDQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyxvQkFBRDtBQUNFLE1BQUEsU0FBUyxFQUFDLDRCQURaO0FBRUUsTUFBQSxlQUFlLEVBQUMsbUJBRmxCO0FBR0UsTUFBQSxLQUFLLEVBQUUsS0FBS0YsS0FBTCxDQUFXSyxNQUFYLElBQXFCLEVBSDlCO0FBSUUsTUFBQSxJQUFJLEVBQUMsSUFKUDtBQUtFLE1BQUEsV0FBVyxFQUFHNEIsSUFBRCxJQUFVO0FBQ3JCLGFBQUtoQixRQUFMLENBQWM7QUFDWlosVUFBQUEsTUFBTSxFQUFFNEI7QUFESSxTQUFkO0FBR0QsT0FUSDtBQVVFLE1BQUEsU0FBUyxFQUFFO0FBVmIsTUFERixlQWFFLG9CQUFDLHdCQUFEO0FBQWEsTUFBQSxTQUFTLEVBQUM7QUFBdkIsb0JBQ0Usb0JBQUMsY0FBRDtBQUNFLE1BQUEsSUFBSSxFQUFFLGdCQURSO0FBRUUsTUFBQSxJQUFJLEVBQUVDLG9CQUFZQyxLQUZwQjtBQUdFLE1BQUEsUUFBUSxFQUFFLEtBQUtuQyxLQUFMLENBQVdNLHFCQUh2QjtBQUlFLE1BQUEsT0FBTyxFQUFFLE1BQU07QUFDYkUsK0JBQWM0QixHQUFkLENBQWtCNUMsb0JBQWxCLEVBQXdDLENBQUMsS0FBS1EsS0FBTCxDQUFXTSxxQkFBcEQ7O0FBQ0EsYUFBS1csUUFBTCxDQUFlb0IsU0FBRCxLQUFnQjtBQUM1Qi9CLFVBQUFBLHFCQUFxQixFQUFFLENBQUMrQixTQUFTLENBQUMvQjtBQUROLFNBQWhCLENBQWQ7QUFHRCxPQVRIO0FBVUUsTUFBQSxPQUFPLEVBQUU7QUFBRWdDLFFBQUFBLEtBQUssRUFBRTtBQUFUO0FBVlgsTUFERixlQWFFLG9CQUFDLGNBQUQ7QUFDRSxNQUFBLElBQUksRUFBRSxHQURSO0FBRUUsTUFBQSxRQUFRLEVBQUUsQ0FBQyxLQUFLdEMsS0FBTCxDQUFXTSxxQkFBWixLQUFzQyxLQUFLTixLQUFMLENBQVdLLE1BQVgsS0FBc0IsRUFBdEIsSUFBNEIsS0FBS0wsS0FBTCxDQUFXSyxNQUFYLElBQXFCLElBQXZGLENBRlo7QUFHRSxNQUFBLElBQUksRUFBRTZCLG9CQUFZQyxLQUhwQjtBQUlFLE1BQUEsT0FBTyxFQUFFLE1BQU07QUFDYjNCLCtCQUFjNEIsR0FBZCxDQUFrQjVDLG9CQUFsQixFQUF3QyxLQUF4Qzs7QUFDQSxhQUFLeUIsUUFBTCxDQUFjO0FBQ1pYLFVBQUFBLHFCQUFxQixFQUFFLEtBRFg7QUFFWkQsVUFBQUEsTUFBTSxFQUFFO0FBRkksU0FBZDtBQUlELE9BVkg7QUFXRSxNQUFBLE9BQU8sRUFBRTtBQUFFaUMsUUFBQUEsS0FBSyxFQUFFO0FBQVQ7QUFYWCxNQWJGLENBYkYsRUF3Q0csOENBQWdCLCtCQUFoQixDQXhDSCxDQURGLGVBMkNFLG9CQUFDLGNBQUQ7QUFBVSxNQUFBLFVBQVUsRUFBRTtBQUF0QixPQUE2QmQsZUFBN0IsQ0EzQ0YsQ0FERjtBQStDRDs7QUExR3FGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXRvbUlucHV0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0F0b21JbnB1dFwiXG5pbXBvcnQgdHlwZSB7IElEZWJ1Z1NlcnZpY2UsIElQcm9jZXNzIH0gZnJvbSBcIi4uL3R5cGVzXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgVHJlZUxpc3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVHJlZVwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgeyBmYXN0RGVib3VuY2UgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvb2JzZXJ2YWJsZVwiXG5pbXBvcnQgUHJvY2Vzc1RyZWVOb2RlIGZyb20gXCIuL1Byb2Nlc3NUcmVlTm9kZVwiXG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvblNpemVzIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvblwiXG5pbXBvcnQgeyBCdXR0b25Hcm91cCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9CdXR0b25Hcm91cFwiXG5pbXBvcnQgZmVhdHVyZUNvbmZpZyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9mZWF0dXJlLWNvbmZpZ1wiXG5pbXBvcnQgeyBBZGRUYXJnZXRCdXR0b24gfSBmcm9tIFwiLi9EZWJ1Z2dlckFkZFRhcmdldEJ1dHRvblwiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG5cbnR5cGUgU3RhdGUgPSB7XG4gIHByb2Nlc3NMaXN0OiBBcnJheTxJUHJvY2Vzcz4sXG4gIGZpbHRlcjogP3N0cmluZyxcbiAgc2hvd1BhdXNlZFRocmVhZHNPbmx5OiBib29sZWFuLFxufVxuXG5jb25zdCBTSE9XX1BBVVNFRF9PTkxZX0tFWSA9IFwiZGVidWdnZXItc2hvdy1wYXVzZWQtdGhyZWFkcy1vbmx5XCJcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGVidWdnZXJQcm9jZXNzQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuUHVyZUNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG5cbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG5cbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgcHJvY2Vzc0xpc3Q6IHRoaXMucHJvcHMuc2VydmljZS5nZXRNb2RlbCgpLmdldFByb2Nlc3NlcygpLFxuICAgICAgZmlsdGVyOiBudWxsLFxuICAgICAgc2hvd1BhdXNlZFRocmVhZHNPbmx5OiBCb29sZWFuKGZlYXR1cmVDb25maWcuZ2V0KFNIT1dfUEFVU0VEX09OTFlfS0VZKSksXG4gICAgfVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgbW9kZWwgPSBzZXJ2aWNlLmdldE1vZGVsKClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKG1vZGVsLm9uRGlkQ2hhbmdlUHJvY2Vzc2VzLmJpbmQobW9kZWwpKVxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxNTApKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIHByb2Nlc3NMaXN0OiBtb2RlbC5nZXRQcm9jZXNzZXMoKSxcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgcHJvY2Vzc0xpc3QsIGZpbHRlciB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGxldCBmaWx0ZXJSZWdFeCA9IG51bGxcbiAgICB0cnkge1xuICAgICAgaWYgKGZpbHRlciAhPSBudWxsKSB7XG4gICAgICAgIGZpbHRlclJlZ0V4ID0gbmV3IFJlZ0V4cChmaWx0ZXIsIFwiaWdcIilcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfKSB7fVxuICAgIGNvbnN0IHByb2Nlc3NFbGVtZW50cyA9IHByb2Nlc3NMaXN0Lm1hcCgocHJvY2VzcywgcHJvY2Vzc0luZGV4KSA9PiB7XG4gICAgICBjb25zdCB7IGFkYXB0ZXJUeXBlLCBwcm9jZXNzTmFtZSB9ID0gcHJvY2Vzcy5jb25maWd1cmF0aW9uXG4gICAgICByZXR1cm4gcHJvY2VzcyA9PSBudWxsID8gKFxuICAgICAgICBcIk5vIHByb2Nlc3NlcyBhcmUgY3VycmVudGx5IGJlaW5nIGRlYnVnZ2VkXCJcbiAgICAgICkgOiAoXG4gICAgICAgIDxQcm9jZXNzVHJlZU5vZGVcbiAgICAgICAgICB0aXRsZT17cHJvY2Vzc05hbWUgIT0gbnVsbCA/IHByb2Nlc3NOYW1lIDogYWRhcHRlclR5cGV9XG4gICAgICAgICAgZmlsdGVyPXtmaWx0ZXJ9XG4gICAgICAgICAgZmlsdGVyUmVnRXg9e2ZpbHRlclJlZ0V4fVxuICAgICAgICAgIHNob3dQYXVzZWRUaHJlYWRzT25seT17dGhpcy5zdGF0ZS5zaG93UGF1c2VkVGhyZWFkc09ubHl9XG4gICAgICAgICAga2V5PXtwcm9jZXNzLmdldElkKCl9XG4gICAgICAgICAgY2hpbGRJdGVtcz17cHJvY2Vzcy5nZXRBbGxUaHJlYWRzKCl9XG4gICAgICAgICAgcHJvY2Vzcz17cHJvY2Vzc31cbiAgICAgICAgICBzZXJ2aWNlPXtzZXJ2aWNlfVxuICAgICAgICAvPlxuICAgICAgKVxuICAgIH0pXG5cbiAgICByZXR1cm4gKFxuICAgICAgPGRpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10aHJlYWQtZmlsdGVyLXJvd1wiPlxuICAgICAgICAgIDxBdG9tSW5wdXRcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXRocmVhZC1maWx0ZXItYm94XCJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyVGV4dD1cIkZpbHRlciB0aHJlYWRzLi4uXCJcbiAgICAgICAgICAgIHZhbHVlPXt0aGlzLnN0YXRlLmZpbHRlciB8fCBcIlwifVxuICAgICAgICAgICAgc2l6ZT1cInNtXCJcbiAgICAgICAgICAgIG9uRGlkQ2hhbmdlPXsodGV4dCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgICAgICBmaWx0ZXI6IHRleHQsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgYXV0b2ZvY3VzPXtmYWxzZX1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxCdXR0b25Hcm91cCBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIj5cbiAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgaWNvbj17XCJwbGF5YmFjay1wYXVzZVwifVxuICAgICAgICAgICAgICBzaXplPXtCdXR0b25TaXplcy5TTUFMTH1cbiAgICAgICAgICAgICAgc2VsZWN0ZWQ9e3RoaXMuc3RhdGUuc2hvd1BhdXNlZFRocmVhZHNPbmx5fVxuICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgZmVhdHVyZUNvbmZpZy5zZXQoU0hPV19QQVVTRURfT05MWV9LRVksICF0aGlzLnN0YXRlLnNob3dQYXVzZWRUaHJlYWRzT25seSlcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKChwcmV2U3RhdGUpID0+ICh7XG4gICAgICAgICAgICAgICAgICBzaG93UGF1c2VkVGhyZWFkc09ubHk6ICFwcmV2U3RhdGUuc2hvd1BhdXNlZFRocmVhZHNPbmx5LFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICB0b29sdGlwPXt7IHRpdGxlOiBcIlNob3cgb25seSBwYXVzZWQgdGhyZWFkc1wiIH19XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICBpY29uPXtcInhcIn1cbiAgICAgICAgICAgICAgZGlzYWJsZWQ9eyF0aGlzLnN0YXRlLnNob3dQYXVzZWRUaHJlYWRzT25seSAmJiAodGhpcy5zdGF0ZS5maWx0ZXIgPT09IFwiXCIgfHwgdGhpcy5zdGF0ZS5maWx0ZXIgPT0gbnVsbCl9XG4gICAgICAgICAgICAgIHNpemU9e0J1dHRvblNpemVzLlNNQUxMfVxuICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgZmVhdHVyZUNvbmZpZy5zZXQoU0hPV19QQVVTRURfT05MWV9LRVksIGZhbHNlKVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICAgICAgICAgICAgc2hvd1BhdXNlZFRocmVhZHNPbmx5OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIGZpbHRlcjogXCJcIixcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICB0b29sdGlwPXt7IHRpdGxlOiBcIkNsZWFyIHRocmVhZCBmaWx0ZXJzXCIgfX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9CdXR0b25Hcm91cD5cbiAgICAgICAgICB7QWRkVGFyZ2V0QnV0dG9uKFwiZGVidWdnZXItc3RlcHBpbmctYnV0dG9uZ3JvdXBcIil9XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8VHJlZUxpc3Qgc2hvd0Fycm93cz17dHJ1ZX0+e3Byb2Nlc3NFbGVtZW50c308L1RyZWVMaXN0PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=