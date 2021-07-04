"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var React = _interopRequireWildcard(require("react"));

var _ExpressionTreeComponent = require("./ExpressionTreeComponent");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

class DebuggerDatatipComponent extends React.Component {
  render() {
    const {
      expression
    } = this.props;

    if (expression.isPending) {
      return /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
        delay: 100,
        size: "EXTRA_SMALL"
      });
    } else if (expression.isError) {
      return null;
    } else {
      return /*#__PURE__*/React.createElement("div", {
        className: "debugger-datatip"
      }, /*#__PURE__*/React.createElement("span", {
        className: "debugger-datatip-value"
      }, /*#__PURE__*/React.createElement(_ExpressionTreeComponent.ExpressionTreeComponent, {
        expression: expression.value,
        containerContext: this
      })));
    }
  }

}

exports.default = DebuggerDatatipComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyRGF0YXRpcENvbXBvbmVudC5qcyJdLCJuYW1lcyI6WyJEZWJ1Z2dlckRhdGF0aXBDb21wb25lbnQiLCJSZWFjdCIsIkNvbXBvbmVudCIsInJlbmRlciIsImV4cHJlc3Npb24iLCJwcm9wcyIsImlzUGVuZGluZyIsImlzRXJyb3IiLCJ2YWx1ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBOztBQUNBOztBQUNBOzs7Ozs7QUFNZSxNQUFNQSx3QkFBTixTQUF1Q0MsS0FBSyxDQUFDQyxTQUE3QyxDQUE4RDtBQUMzRUMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRUMsTUFBQUE7QUFBRixRQUFpQixLQUFLQyxLQUE1Qjs7QUFDQSxRQUFJRCxVQUFVLENBQUNFLFNBQWYsRUFBMEI7QUFDeEIsMEJBQU8sb0JBQUMsOEJBQUQ7QUFBZ0IsUUFBQSxLQUFLLEVBQUUsR0FBdkI7QUFBNEIsUUFBQSxJQUFJLEVBQUM7QUFBakMsUUFBUDtBQUNELEtBRkQsTUFFTyxJQUFJRixVQUFVLENBQUNHLE9BQWYsRUFBd0I7QUFDN0IsYUFBTyxJQUFQO0FBQ0QsS0FGTSxNQUVBO0FBQ0wsMEJBQ0U7QUFBSyxRQUFBLFNBQVMsRUFBQztBQUFmLHNCQUNFO0FBQU0sUUFBQSxTQUFTLEVBQUM7QUFBaEIsc0JBQ0Usb0JBQUMsZ0RBQUQ7QUFBeUIsUUFBQSxVQUFVLEVBQUVILFVBQVUsQ0FBQ0ksS0FBaEQ7QUFBdUQsUUFBQSxnQkFBZ0IsRUFBRTtBQUF6RSxRQURGLENBREYsQ0FERjtBQU9EO0FBQ0Y7O0FBaEIwRSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgRXhwZWN0ZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxuaW1wb3J0IHR5cGUgeyBJRXhwcmVzc2lvbiB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCB7IExvYWRpbmdTcGlubmVyIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgeyBFeHByZXNzaW9uVHJlZUNvbXBvbmVudCB9IGZyb20gXCIuL0V4cHJlc3Npb25UcmVlQ29tcG9uZW50XCJcblxudHlwZSBQcm9wcyA9IHtcbiAgK2V4cHJlc3Npb246IEV4cGVjdGVkPElFeHByZXNzaW9uPixcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGVidWdnZXJEYXRhdGlwQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFByb3BzPiB7XG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IGV4cHJlc3Npb24gfSA9IHRoaXMucHJvcHNcbiAgICBpZiAoZXhwcmVzc2lvbi5pc1BlbmRpbmcpIHtcbiAgICAgIHJldHVybiA8TG9hZGluZ1NwaW5uZXIgZGVsYXk9ezEwMH0gc2l6ZT1cIkVYVFJBX1NNQUxMXCIgLz5cbiAgICB9IGVsc2UgaWYgKGV4cHJlc3Npb24uaXNFcnJvcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1kYXRhdGlwXCI+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZGVidWdnZXItZGF0YXRpcC12YWx1ZVwiPlxuICAgICAgICAgICAgPEV4cHJlc3Npb25UcmVlQ29tcG9uZW50IGV4cHJlc3Npb249e2V4cHJlc3Npb24udmFsdWV9IGNvbnRhaW5lckNvbnRleHQ9e3RoaXN9IC8+XG4gICAgICAgICAgPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIClcbiAgICB9XG4gIH1cbn1cbiJdfQ==