"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DebuggerProcessTreeView;

var _classnames = _interopRequireDefault(require("classnames"));

var _Block = require("@atom-ide-community/nuclide-commons-ui/Block");

var React = _interopRequireWildcard(require("react"));

var _DebuggerProcessComponent = _interopRequireDefault(require("./DebuggerProcessComponent"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function DebuggerProcessTreeView(props) {
  return /*#__PURE__*/React.createElement("div", {
    className: (0, _classnames.default)("debugger-container-new", "debugger-breakpoint-list", "debugger-tree")
  }, /*#__PURE__*/React.createElement("div", {
    className: "debugger-pane-content "
  }, /*#__PURE__*/React.createElement(_Block.Block, null, /*#__PURE__*/React.createElement(_DebuggerProcessComponent.default, {
    service: props.service
  }))));
}

module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyUHJvY2Vzc1RyZWVWaWV3LmpzIl0sIm5hbWVzIjpbIkRlYnVnZ2VyUHJvY2Vzc1RyZWVWaWV3IiwicHJvcHMiLCJzZXJ2aWNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRWUsU0FBU0EsdUJBQVQsQ0FBaUNDLEtBQWpDLEVBQWdGO0FBQzdGLHNCQUNFO0FBQUssSUFBQSxTQUFTLEVBQUUseUJBQVcsd0JBQVgsRUFBcUMsMEJBQXJDLEVBQWlFLGVBQWpFO0FBQWhCLGtCQUNFO0FBQUssSUFBQSxTQUFTLEVBQUM7QUFBZixrQkFDRSxvQkFBQyxZQUFELHFCQUNFLG9CQUFDLGlDQUFEO0FBQTBCLElBQUEsT0FBTyxFQUFFQSxLQUFLLENBQUNDO0FBQXpDLElBREYsQ0FERixDQURGLENBREY7QUFTRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCB7IEJsb2NrIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0Jsb2NrXCJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgRGVidWdnZXJQcm9jZXNzQ29tcG9uZW50IGZyb20gXCIuL0RlYnVnZ2VyUHJvY2Vzc0NvbXBvbmVudFwiXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIERlYnVnZ2VyUHJvY2Vzc1RyZWVWaWV3KHByb3BzOiB7IHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UgfSk6IFJlYWN0Lk5vZGUge1xuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItY29udGFpbmVyLW5ld1wiLCBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtbGlzdFwiLCBcImRlYnVnZ2VyLXRyZWVcIil9PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1wYW5lLWNvbnRlbnQgXCI+XG4gICAgICAgIDxCbG9jaz5cbiAgICAgICAgICA8RGVidWdnZXJQcm9jZXNzQ29tcG9uZW50IHNlcnZpY2U9e3Byb3BzLnNlcnZpY2V9IC8+XG4gICAgICAgIDwvQmxvY2s+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgKVxufVxuIl19