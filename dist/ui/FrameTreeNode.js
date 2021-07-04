"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var React = _interopRequireWildcard(require("react"));

var _Tree = require("@atom-ide-community/nuclide-commons-ui/Tree");

var _classnames = _interopRequireDefault(require("classnames"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

class FrameTreeNode extends React.Component {
  constructor(props) {
    super(props);

    this.handleSelect = () => {
      this.props.service.viewModel.setFocusedStackFrame(this.props.frame, true);
    };
  }

  render() {
    const {
      frame,
      service
    } = this.props;
    const activeFrame = service.viewModel.focusedStackFrame;
    const className = (activeFrame == null ? false : frame === activeFrame) ? (0, _classnames.default)("debugger-tree-frame-selected", "debugger-tree-frame") : "debugger-tree-frame";
    const treeItem = /*#__PURE__*/React.createElement(_Tree.TreeItem, {
      className: className,
      onSelect: this.handleSelect,
      title: `Frame ID: ${frame.frameId}, Name: ${frame.name}` + (frame.thread.stopped && frame.thread.getCallStackTopFrame() === frame && frame.source != null && frame.source.name != null ? `, Stopped at: ${frame.source.name}: ${frame.range.end.row}` : "")
    }, frame.name);
    return treeItem;
  }

}

exports.default = FrameTreeNode;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkZyYW1lVHJlZU5vZGUuanMiXSwibmFtZXMiOlsiRnJhbWVUcmVlTm9kZSIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsImhhbmRsZVNlbGVjdCIsInNlcnZpY2UiLCJ2aWV3TW9kZWwiLCJzZXRGb2N1c2VkU3RhY2tGcmFtZSIsImZyYW1lIiwicmVuZGVyIiwiYWN0aXZlRnJhbWUiLCJmb2N1c2VkU3RhY2tGcmFtZSIsImNsYXNzTmFtZSIsInRyZWVJdGVtIiwiZnJhbWVJZCIsIm5hbWUiLCJ0aHJlYWQiLCJzdG9wcGVkIiwiZ2V0Q2FsbFN0YWNrVG9wRnJhbWUiLCJzb3VyY2UiLCJyYW5nZSIsImVuZCIsInJvdyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOzs7Ozs7OztBQU9lLE1BQU1BLGFBQU4sU0FBNEJDLEtBQUssQ0FBQ0MsU0FBbEMsQ0FBbUQ7QUFDaEVDLEVBQUFBLFdBQVcsQ0FBQ0MsS0FBRCxFQUFlO0FBQ3hCLFVBQU1BLEtBQU47O0FBRHdCLFNBSTFCQyxZQUowQixHQUlYLE1BQU07QUFDbkIsV0FBS0QsS0FBTCxDQUFXRSxPQUFYLENBQW1CQyxTQUFuQixDQUE2QkMsb0JBQTdCLENBQWtELEtBQUtKLEtBQUwsQ0FBV0ssS0FBN0QsRUFBb0UsSUFBcEU7QUFDRCxLQU55QjtBQUV6Qjs7QUFNREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRUQsTUFBQUEsS0FBRjtBQUFTSCxNQUFBQTtBQUFULFFBQXFCLEtBQUtGLEtBQWhDO0FBQ0EsVUFBTU8sV0FBVyxHQUFHTCxPQUFPLENBQUNDLFNBQVIsQ0FBa0JLLGlCQUF0QztBQUNBLFVBQU1DLFNBQVMsR0FBRyxDQUFDRixXQUFXLElBQUksSUFBZixHQUFzQixLQUF0QixHQUE4QkYsS0FBSyxLQUFLRSxXQUF6QyxJQUNkLHlCQUFXLDhCQUFYLEVBQTJDLHFCQUEzQyxDQURjLEdBRWQscUJBRko7QUFJQSxVQUFNRyxRQUFRLGdCQUNaLG9CQUFDLGNBQUQ7QUFDRSxNQUFBLFNBQVMsRUFBRUQsU0FEYjtBQUVFLE1BQUEsUUFBUSxFQUFFLEtBQUtSLFlBRmpCO0FBR0UsTUFBQSxLQUFLLEVBQ0YsYUFBWUksS0FBSyxDQUFDTSxPQUFRLFdBQVVOLEtBQUssQ0FBQ08sSUFBSyxFQUFoRCxJQUNDUCxLQUFLLENBQUNRLE1BQU4sQ0FBYUMsT0FBYixJQUNEVCxLQUFLLENBQUNRLE1BQU4sQ0FBYUUsb0JBQWIsT0FBd0NWLEtBRHZDLElBRURBLEtBQUssQ0FBQ1csTUFBTixJQUFnQixJQUZmLElBR0RYLEtBQUssQ0FBQ1csTUFBTixDQUFhSixJQUFiLElBQXFCLElBSHBCLEdBSUksaUJBQWdCUCxLQUFLLENBQUNXLE1BQU4sQ0FBYUosSUFBSyxLQUFJUCxLQUFLLENBQUNZLEtBQU4sQ0FBWUMsR0FBWixDQUFnQkMsR0FBSSxFQUo5RCxHQUtHLEVBTko7QUFKSixPQWFHZCxLQUFLLENBQUNPLElBYlQsQ0FERjtBQWtCQSxXQUFPRixRQUFQO0FBQ0Q7O0FBbkMrRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSVN0YWNrRnJhbWUsIElEZWJ1Z1NlcnZpY2UgfSBmcm9tIFwiLi4vdHlwZXNcIlxuXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgVHJlZUl0ZW0gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVHJlZVwiXG5pbXBvcnQgY2xhc3NuYW1lcyBmcm9tIFwiY2xhc3NuYW1lc1wiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIGZyYW1lOiBJU3RhY2tGcmFtZSwgLy8gVGhlIGZyYW1lIHRoYXQgdGhpcyBub2RlIHJlcHJlc2VudHMuXG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEZyYW1lVHJlZU5vZGUgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHM+IHtcbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gIH1cblxuICBoYW5kbGVTZWxlY3QgPSAoKSA9PiB7XG4gICAgdGhpcy5wcm9wcy5zZXJ2aWNlLnZpZXdNb2RlbC5zZXRGb2N1c2VkU3RhY2tGcmFtZSh0aGlzLnByb3BzLmZyYW1lLCB0cnVlKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgZnJhbWUsIHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCBhY3RpdmVGcmFtZSA9IHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lXG4gICAgY29uc3QgY2xhc3NOYW1lID0gKGFjdGl2ZUZyYW1lID09IG51bGwgPyBmYWxzZSA6IGZyYW1lID09PSBhY3RpdmVGcmFtZSlcbiAgICAgID8gY2xhc3NuYW1lcyhcImRlYnVnZ2VyLXRyZWUtZnJhbWUtc2VsZWN0ZWRcIiwgXCJkZWJ1Z2dlci10cmVlLWZyYW1lXCIpXG4gICAgICA6IFwiZGVidWdnZXItdHJlZS1mcmFtZVwiXG5cbiAgICBjb25zdCB0cmVlSXRlbSA9IChcbiAgICAgIDxUcmVlSXRlbVxuICAgICAgICBjbGFzc05hbWU9e2NsYXNzTmFtZX1cbiAgICAgICAgb25TZWxlY3Q9e3RoaXMuaGFuZGxlU2VsZWN0fVxuICAgICAgICB0aXRsZT17XG4gICAgICAgICAgYEZyYW1lIElEOiAke2ZyYW1lLmZyYW1lSWR9LCBOYW1lOiAke2ZyYW1lLm5hbWV9YCArXG4gICAgICAgICAgKGZyYW1lLnRocmVhZC5zdG9wcGVkICYmXG4gICAgICAgICAgZnJhbWUudGhyZWFkLmdldENhbGxTdGFja1RvcEZyYW1lKCkgPT09IGZyYW1lICYmXG4gICAgICAgICAgZnJhbWUuc291cmNlICE9IG51bGwgJiZcbiAgICAgICAgICBmcmFtZS5zb3VyY2UubmFtZSAhPSBudWxsXG4gICAgICAgICAgICA/IGAsIFN0b3BwZWQgYXQ6ICR7ZnJhbWUuc291cmNlLm5hbWV9OiAke2ZyYW1lLnJhbmdlLmVuZC5yb3d9YFxuICAgICAgICAgICAgOiBcIlwiKVxuICAgICAgICB9XG4gICAgICA+XG4gICAgICAgIHtmcmFtZS5uYW1lfVxuICAgICAgPC9UcmVlSXRlbT5cbiAgICApXG5cbiAgICByZXR1cm4gdHJlZUl0ZW1cbiAgfVxufVxuIl19