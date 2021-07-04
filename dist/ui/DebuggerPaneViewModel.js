"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var React = _interopRequireWildcard(require("react"));

var _constants = require("../constants");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

// A model that will serve as the view model for all debugger panes. We must provide
// a unique instance of a view model for each pane, which Atom can destroy when the
// pane that contains it is destroyed. We therefore cannot give it the actual debugger
// model directly, since there is only one and its lifetime is tied to the lifetime
// of the debugging session.
class DebuggerPaneViewModel {
  constructor(config, isLifetimeView, paneDestroyed, preferredWidth) {
    this._config = void 0;
    this._isLifetimeView = void 0;
    this._paneDestroyed = void 0;
    this._removedFromLayout = void 0;
    this._preferredWidth = void 0;
    this._config = config;
    this._isLifetimeView = isLifetimeView;
    this._paneDestroyed = paneDestroyed;
    this._removedFromLayout = false;
    this._preferredWidth = preferredWidth;
  }

  dispose() {}

  destroy() {
    if (!this._removedFromLayout) {
      this._paneDestroyed(this._config);
    }
  }

  getTitle() {
    return this._config.title();
  }

  getDefaultLocation() {
    return _constants.DEBUGGER_PANELS_DEFAULT_LOCATION;
  }

  getURI() {
    return this._config.uri;
  }

  getPreferredWidth() {
    return this._preferredWidth == null ? _constants.DEBUGGER_PANELS_DEFAULT_WIDTH_PX : this._preferredWidth;
  }

  createView() {
    if (this._config.previousLocation != null) {
      this._config.previousLocation.userHidden = false;
    }

    return this._config.createView();
  }

  getConfig() {
    return this._config;
  }

  isLifetimeView() {
    return this._isLifetimeView;
  }

  setRemovedFromLayout(removed) {
    this._removedFromLayout = removed;
  } // Atom view needs to provide this, otherwise Atom throws an exception splitting panes for the view.


  serialize() {
    return {};
  }

  copy() {
    return false;
  }

}

exports.default = DebuggerPaneViewModel;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyUGFuZVZpZXdNb2RlbC5qcyJdLCJuYW1lcyI6WyJEZWJ1Z2dlclBhbmVWaWV3TW9kZWwiLCJjb25zdHJ1Y3RvciIsImNvbmZpZyIsImlzTGlmZXRpbWVWaWV3IiwicGFuZURlc3Ryb3llZCIsInByZWZlcnJlZFdpZHRoIiwiX2NvbmZpZyIsIl9pc0xpZmV0aW1lVmlldyIsIl9wYW5lRGVzdHJveWVkIiwiX3JlbW92ZWRGcm9tTGF5b3V0IiwiX3ByZWZlcnJlZFdpZHRoIiwiZGlzcG9zZSIsImRlc3Ryb3kiLCJnZXRUaXRsZSIsInRpdGxlIiwiZ2V0RGVmYXVsdExvY2F0aW9uIiwiREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfTE9DQVRJT04iLCJnZXRVUkkiLCJ1cmkiLCJnZXRQcmVmZXJyZWRXaWR0aCIsIkRFQlVHR0VSX1BBTkVMU19ERUZBVUxUX1dJRFRIX1BYIiwiY3JlYXRlVmlldyIsInByZXZpb3VzTG9jYXRpb24iLCJ1c2VySGlkZGVuIiwiZ2V0Q29uZmlnIiwic2V0UmVtb3ZlZEZyb21MYXlvdXQiLCJyZW1vdmVkIiwic2VyaWFsaXplIiwiY29weSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOzs7Ozs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ2UsTUFBTUEscUJBQU4sQ0FBNEI7QUFPekNDLEVBQUFBLFdBQVcsQ0FDVEMsTUFEUyxFQUVUQyxjQUZTLEVBR1RDLGFBSFMsRUFJVEMsY0FKUyxFQUtUO0FBQUEsU0FYRkMsT0FXRTtBQUFBLFNBVkZDLGVBVUU7QUFBQSxTQVRGQyxjQVNFO0FBQUEsU0FSRkMsa0JBUUU7QUFBQSxTQVBGQyxlQU9FO0FBQ0EsU0FBS0osT0FBTCxHQUFlSixNQUFmO0FBQ0EsU0FBS0ssZUFBTCxHQUF1QkosY0FBdkI7QUFDQSxTQUFLSyxjQUFMLEdBQXNCSixhQUF0QjtBQUNBLFNBQUtLLGtCQUFMLEdBQTBCLEtBQTFCO0FBQ0EsU0FBS0MsZUFBTCxHQUF1QkwsY0FBdkI7QUFDRDs7QUFFRE0sRUFBQUEsT0FBTyxHQUFTLENBQUU7O0FBRWxCQyxFQUFBQSxPQUFPLEdBQVM7QUFDZCxRQUFJLENBQUMsS0FBS0gsa0JBQVYsRUFBOEI7QUFDNUIsV0FBS0QsY0FBTCxDQUFvQixLQUFLRixPQUF6QjtBQUNEO0FBQ0Y7O0FBRURPLEVBQUFBLFFBQVEsR0FBVztBQUNqQixXQUFPLEtBQUtQLE9BQUwsQ0FBYVEsS0FBYixFQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLGtCQUFrQixHQUFXO0FBQzNCLFdBQU9DLDJDQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLE1BQU0sR0FBVztBQUNmLFdBQU8sS0FBS1gsT0FBTCxDQUFhWSxHQUFwQjtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBVztBQUMxQixXQUFPLEtBQUtULGVBQUwsSUFBd0IsSUFBeEIsR0FBK0JVLDJDQUEvQixHQUFrRSxLQUFLVixlQUE5RTtBQUNEOztBQUVEVyxFQUFBQSxVQUFVLEdBQXVCO0FBQy9CLFFBQUksS0FBS2YsT0FBTCxDQUFhZ0IsZ0JBQWIsSUFBaUMsSUFBckMsRUFBMkM7QUFDekMsV0FBS2hCLE9BQUwsQ0FBYWdCLGdCQUFiLENBQThCQyxVQUE5QixHQUEyQyxLQUEzQztBQUNEOztBQUNELFdBQU8sS0FBS2pCLE9BQUwsQ0FBYWUsVUFBYixFQUFQO0FBQ0Q7O0FBRURHLEVBQUFBLFNBQVMsR0FBdUI7QUFDOUIsV0FBTyxLQUFLbEIsT0FBWjtBQUNEOztBQUVESCxFQUFBQSxjQUFjLEdBQVk7QUFDeEIsV0FBTyxLQUFLSSxlQUFaO0FBQ0Q7O0FBRURrQixFQUFBQSxvQkFBb0IsQ0FBQ0MsT0FBRCxFQUF5QjtBQUMzQyxTQUFLakIsa0JBQUwsR0FBMEJpQixPQUExQjtBQUNELEdBN0R3QyxDQStEekM7OztBQUNBQyxFQUFBQSxTQUFTLEdBQVc7QUFDbEIsV0FBTyxFQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLElBQUksR0FBWTtBQUNkLFdBQU8sS0FBUDtBQUNEOztBQXRFd0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IERlYnVnZ2VyUGFuZUNvbmZpZyB9IGZyb20gXCIuL0RlYnVnZ2VyTGF5b3V0TWFuYWdlclwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgREVCVUdHRVJfUEFORUxTX0RFRkFVTFRfV0lEVEhfUFgsIERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5cbi8vIEEgbW9kZWwgdGhhdCB3aWxsIHNlcnZlIGFzIHRoZSB2aWV3IG1vZGVsIGZvciBhbGwgZGVidWdnZXIgcGFuZXMuIFdlIG11c3QgcHJvdmlkZVxuLy8gYSB1bmlxdWUgaW5zdGFuY2Ugb2YgYSB2aWV3IG1vZGVsIGZvciBlYWNoIHBhbmUsIHdoaWNoIEF0b20gY2FuIGRlc3Ryb3kgd2hlbiB0aGVcbi8vIHBhbmUgdGhhdCBjb250YWlucyBpdCBpcyBkZXN0cm95ZWQuIFdlIHRoZXJlZm9yZSBjYW5ub3QgZ2l2ZSBpdCB0aGUgYWN0dWFsIGRlYnVnZ2VyXG4vLyBtb2RlbCBkaXJlY3RseSwgc2luY2UgdGhlcmUgaXMgb25seSBvbmUgYW5kIGl0cyBsaWZldGltZSBpcyB0aWVkIHRvIHRoZSBsaWZldGltZVxuLy8gb2YgdGhlIGRlYnVnZ2luZyBzZXNzaW9uLlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGVidWdnZXJQYW5lVmlld01vZGVsIHtcbiAgX2NvbmZpZzogRGVidWdnZXJQYW5lQ29uZmlnXG4gIF9pc0xpZmV0aW1lVmlldzogYm9vbGVhblxuICBfcGFuZURlc3Ryb3llZDogKHBhbmU6IERlYnVnZ2VyUGFuZUNvbmZpZykgPT4gdm9pZFxuICBfcmVtb3ZlZEZyb21MYXlvdXQ6IGJvb2xlYW5cbiAgX3ByZWZlcnJlZFdpZHRoOiA/bnVtYmVyXG5cbiAgY29uc3RydWN0b3IoXG4gICAgY29uZmlnOiBEZWJ1Z2dlclBhbmVDb25maWcsXG4gICAgaXNMaWZldGltZVZpZXc6IGJvb2xlYW4sXG4gICAgcGFuZURlc3Ryb3llZDogKHBhbmU6IERlYnVnZ2VyUGFuZUNvbmZpZykgPT4gdm9pZCxcbiAgICBwcmVmZXJyZWRXaWR0aDogP251bWJlclxuICApIHtcbiAgICB0aGlzLl9jb25maWcgPSBjb25maWdcbiAgICB0aGlzLl9pc0xpZmV0aW1lVmlldyA9IGlzTGlmZXRpbWVWaWV3XG4gICAgdGhpcy5fcGFuZURlc3Ryb3llZCA9IHBhbmVEZXN0cm95ZWRcbiAgICB0aGlzLl9yZW1vdmVkRnJvbUxheW91dCA9IGZhbHNlXG4gICAgdGhpcy5fcHJlZmVycmVkV2lkdGggPSBwcmVmZXJyZWRXaWR0aFxuICB9XG5cbiAgZGlzcG9zZSgpOiB2b2lkIHt9XG5cbiAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuX3JlbW92ZWRGcm9tTGF5b3V0KSB7XG4gICAgICB0aGlzLl9wYW5lRGVzdHJveWVkKHRoaXMuX2NvbmZpZylcbiAgICB9XG4gIH1cblxuICBnZXRUaXRsZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9jb25maWcudGl0bGUoKVxuICB9XG5cbiAgZ2V0RGVmYXVsdExvY2F0aW9uKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX0xPQ0FUSU9OXG4gIH1cblxuICBnZXRVUkkoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLnVyaVxuICB9XG5cbiAgZ2V0UHJlZmVycmVkV2lkdGgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fcHJlZmVycmVkV2lkdGggPT0gbnVsbCA/IERFQlVHR0VSX1BBTkVMU19ERUZBVUxUX1dJRFRIX1BYIDogdGhpcy5fcHJlZmVycmVkV2lkdGhcbiAgfVxuXG4gIGNyZWF0ZVZpZXcoKTogUmVhY3QuRWxlbWVudDxhbnk+IHtcbiAgICBpZiAodGhpcy5fY29uZmlnLnByZXZpb3VzTG9jYXRpb24gIT0gbnVsbCkge1xuICAgICAgdGhpcy5fY29uZmlnLnByZXZpb3VzTG9jYXRpb24udXNlckhpZGRlbiA9IGZhbHNlXG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jb25maWcuY3JlYXRlVmlldygpXG4gIH1cblxuICBnZXRDb25maWcoKTogRGVidWdnZXJQYW5lQ29uZmlnIHtcbiAgICByZXR1cm4gdGhpcy5fY29uZmlnXG4gIH1cblxuICBpc0xpZmV0aW1lVmlldygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5faXNMaWZldGltZVZpZXdcbiAgfVxuXG4gIHNldFJlbW92ZWRGcm9tTGF5b3V0KHJlbW92ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLl9yZW1vdmVkRnJvbUxheW91dCA9IHJlbW92ZWRcbiAgfVxuXG4gIC8vIEF0b20gdmlldyBuZWVkcyB0byBwcm92aWRlIHRoaXMsIG90aGVyd2lzZSBBdG9tIHRocm93cyBhbiBleGNlcHRpb24gc3BsaXR0aW5nIHBhbmVzIGZvciB0aGUgdmlldy5cbiAgc2VyaWFsaXplKCk6IE9iamVjdCB7XG4gICAgcmV0dXJuIHt9XG4gIH1cblxuICBjb3B5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG4iXX0=