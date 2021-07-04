"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classnames = _interopRequireDefault(require("classnames"));

var React = _interopRequireWildcard(require("react"));

var _BreakpointListComponent = _interopRequireDefault(require("./BreakpointListComponent"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class BreakpointsView extends React.PureComponent {
  render() {
    const {
      service
    } = this.props;
    return /*#__PURE__*/React.createElement("div", {
      className: (0, _classnames.default)("debugger-container-new", "debugger-breakpoint-list")
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-pane-content "
    }, /*#__PURE__*/React.createElement(_BreakpointListComponent.default, {
      service: service
    })));
  }

}

exports.default = BreakpointsView;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRzVmlldy5qcyJdLCJuYW1lcyI6WyJCcmVha3BvaW50c1ZpZXciLCJSZWFjdCIsIlB1cmVDb21wb25lbnQiLCJyZW5kZXIiLCJzZXJ2aWNlIiwicHJvcHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFNZSxNQUFNQSxlQUFOLFNBQThCQyxLQUFLLENBQUNDLGFBQXBDLENBQXlEO0FBQ3RFQyxFQUFBQSxNQUFNLEdBQWU7QUFDbkIsVUFBTTtBQUFFQyxNQUFBQTtBQUFGLFFBQWMsS0FBS0MsS0FBekI7QUFFQSx3QkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFFLHlCQUFXLHdCQUFYLEVBQXFDLDBCQUFyQztBQUFoQixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsb0JBQ0Usb0JBQUMsZ0NBQUQ7QUFBeUIsTUFBQSxPQUFPLEVBQUVEO0FBQWxDLE1BREYsQ0FERixDQURGO0FBT0Q7O0FBWHFFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcblxuaW1wb3J0IGNsYXNzbmFtZXMgZnJvbSBcImNsYXNzbmFtZXNcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBCcmVha3BvaW50TGlzdENvbXBvbmVudCBmcm9tIFwiLi9CcmVha3BvaW50TGlzdENvbXBvbmVudFwiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyZWFrcG9pbnRzVmlldyBleHRlbmRzIFJlYWN0LlB1cmVDb21wb25lbnQ8UHJvcHM+IHtcbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuXG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItY29udGFpbmVyLW5ld1wiLCBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtbGlzdFwiKX0+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItcGFuZS1jb250ZW50IFwiPlxuICAgICAgICAgIDxCcmVha3BvaW50TGlzdENvbXBvbmVudCBzZXJ2aWNlPXtzZXJ2aWNlfSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxufVxuIl19