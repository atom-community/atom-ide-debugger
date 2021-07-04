"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AddTargetButton = AddTargetButton;

var React = _interopRequireWildcard(require("react"));

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _Dropdown = require("@atom-ide-community/nuclide-commons-ui/Dropdown");

var _goToLocation = require("@atom-ide-community/nuclide-commons-atom/go-to-location");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const DEVICE_PANEL_URL = "atom://nuclide/devices";

function AddTargetButton(className) {
  return /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
    className: className
  }, /*#__PURE__*/React.createElement(_Dropdown.Dropdown, {
    className: "debugger-stepping-svg-button",
    tooltip: {
      title: "Start debugging an additional debug target..."
    },
    options: [{
      label: "Add target...",
      value: null,
      hidden: true
    }, {
      label: "Attach debugger...",
      value: "attach"
    }, {
      label: "Launch debugger...",
      value: "launch"
    }, {
      label: "Manage devices...",
      value: "devices"
    }],
    onChange: value => {
      switch (value) {
        case "attach":
          {
            atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show-attach-dialog");
            break;
          }

        case "launch":
          {
            atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show-launch-dialog");
            break;
          }

        case "devices":
          {
            (0, _goToLocation.goToLocation)(DEVICE_PANEL_URL);
            break;
          }

        default:
          break;
      }
    }
  }));
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQWRkVGFyZ2V0QnV0dG9uLmpzIl0sIm5hbWVzIjpbIkRFVklDRV9QQU5FTF9VUkwiLCJBZGRUYXJnZXRCdXR0b24iLCJjbGFzc05hbWUiLCJ0aXRsZSIsImxhYmVsIiwidmFsdWUiLCJoaWRkZW4iLCJhdG9tIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsInZpZXdzIiwiZ2V0VmlldyIsIndvcmtzcGFjZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxnQkFBZ0IsR0FBRyx3QkFBekI7O0FBRU8sU0FBU0MsZUFBVCxDQUF5QkMsU0FBekIsRUFBNEM7QUFDakQsc0JBQ0Usb0JBQUMsd0JBQUQ7QUFBYSxJQUFBLFNBQVMsRUFBRUE7QUFBeEIsa0JBQ0Usb0JBQUMsa0JBQUQ7QUFDRSxJQUFBLFNBQVMsRUFBQyw4QkFEWjtBQUVFLElBQUEsT0FBTyxFQUFFO0FBQ1BDLE1BQUFBLEtBQUssRUFBRTtBQURBLEtBRlg7QUFLRSxJQUFBLE9BQU8sRUFBRSxDQUNQO0FBQUVDLE1BQUFBLEtBQUssRUFBRSxlQUFUO0FBQTBCQyxNQUFBQSxLQUFLLEVBQUUsSUFBakM7QUFBdUNDLE1BQUFBLE1BQU0sRUFBRTtBQUEvQyxLQURPLEVBRVA7QUFBRUYsTUFBQUEsS0FBSyxFQUFFLG9CQUFUO0FBQStCQyxNQUFBQSxLQUFLLEVBQUU7QUFBdEMsS0FGTyxFQUdQO0FBQUVELE1BQUFBLEtBQUssRUFBRSxvQkFBVDtBQUErQkMsTUFBQUEsS0FBSyxFQUFFO0FBQXRDLEtBSE8sRUFJUDtBQUFFRCxNQUFBQSxLQUFLLEVBQUUsbUJBQVQ7QUFBOEJDLE1BQUFBLEtBQUssRUFBRTtBQUFyQyxLQUpPLENBTFg7QUFXRSxJQUFBLFFBQVEsRUFBR0EsS0FBRCxJQUFXO0FBQ25CLGNBQVFBLEtBQVI7QUFDRSxhQUFLLFFBQUw7QUFBZTtBQUNiRSxZQUFBQSxJQUFJLENBQUNDLFFBQUwsQ0FBY0MsUUFBZCxDQUF1QkYsSUFBSSxDQUFDRyxLQUFMLENBQVdDLE9BQVgsQ0FBbUJKLElBQUksQ0FBQ0ssU0FBeEIsQ0FBdkIsRUFBMkQsNkJBQTNEO0FBQ0E7QUFDRDs7QUFDRCxhQUFLLFFBQUw7QUFBZTtBQUNiTCxZQUFBQSxJQUFJLENBQUNDLFFBQUwsQ0FBY0MsUUFBZCxDQUF1QkYsSUFBSSxDQUFDRyxLQUFMLENBQVdDLE9BQVgsQ0FBbUJKLElBQUksQ0FBQ0ssU0FBeEIsQ0FBdkIsRUFBMkQsNkJBQTNEO0FBQ0E7QUFDRDs7QUFDRCxhQUFLLFNBQUw7QUFBZ0I7QUFDZCw0Q0FBYVosZ0JBQWI7QUFDQTtBQUNEOztBQUNEO0FBQ0U7QUFkSjtBQWdCRDtBQTVCSCxJQURGLENBREY7QUFrQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgQnV0dG9uR3JvdXAgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQnV0dG9uR3JvdXBcIlxuaW1wb3J0IHsgRHJvcGRvd24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvRHJvcGRvd25cIlxuaW1wb3J0IHsgZ29Ub0xvY2F0aW9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vZ28tdG8tbG9jYXRpb25cIlxuXG5jb25zdCBERVZJQ0VfUEFORUxfVVJMID0gXCJhdG9tOi8vbnVjbGlkZS9kZXZpY2VzXCJcblxuZXhwb3J0IGZ1bmN0aW9uIEFkZFRhcmdldEJ1dHRvbihjbGFzc05hbWU6IHN0cmluZykge1xuICByZXR1cm4gKFxuICAgIDxCdXR0b25Hcm91cCBjbGFzc05hbWU9e2NsYXNzTmFtZX0+XG4gICAgICA8RHJvcGRvd25cbiAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctc3ZnLWJ1dHRvblwiXG4gICAgICAgIHRvb2x0aXA9e3tcbiAgICAgICAgICB0aXRsZTogXCJTdGFydCBkZWJ1Z2dpbmcgYW4gYWRkaXRpb25hbCBkZWJ1ZyB0YXJnZXQuLi5cIixcbiAgICAgICAgfX1cbiAgICAgICAgb3B0aW9ucz17W1xuICAgICAgICAgIHsgbGFiZWw6IFwiQWRkIHRhcmdldC4uLlwiLCB2YWx1ZTogbnVsbCwgaGlkZGVuOiB0cnVlIH0sXG4gICAgICAgICAgeyBsYWJlbDogXCJBdHRhY2ggZGVidWdnZXIuLi5cIiwgdmFsdWU6IFwiYXR0YWNoXCIgfSxcbiAgICAgICAgICB7IGxhYmVsOiBcIkxhdW5jaCBkZWJ1Z2dlci4uLlwiLCB2YWx1ZTogXCJsYXVuY2hcIiB9LFxuICAgICAgICAgIHsgbGFiZWw6IFwiTWFuYWdlIGRldmljZXMuLi5cIiwgdmFsdWU6IFwiZGV2aWNlc1wiIH0sXG4gICAgICAgIF19XG4gICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiAgICAgICAgICBzd2l0Y2ggKHZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYXR0YWNoXCI6IHtcbiAgICAgICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChhdG9tLnZpZXdzLmdldFZpZXcoYXRvbS53b3Jrc3BhY2UpLCBcImRlYnVnZ2VyOnNob3ctYXR0YWNoLWRpYWxvZ1wiKVxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcImxhdW5jaFwiOiB7XG4gICAgICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpzaG93LWxhdW5jaC1kaWFsb2dcIilcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCJkZXZpY2VzXCI6IHtcbiAgICAgICAgICAgICAgZ29Ub0xvY2F0aW9uKERFVklDRV9QQU5FTF9VUkwpXG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgfX1cbiAgICAgIC8+XG4gICAgPC9CdXR0b25Hcm91cD5cbiAgKVxufVxuIl19