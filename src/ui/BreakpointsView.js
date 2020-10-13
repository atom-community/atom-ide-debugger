import type { IDebugService } from "../types"

import classnames from "classnames"
import * as React from "react"
import BreakpointListComponent from "./BreakpointListComponent"

type Props = {
  service: IDebugService,
}

export default class BreakpointsView extends React.PureComponent<Props> {
  render(): React.Node {
    const { service } = this.props

    return (
      <div className={classnames("debugger-container-new", "debugger-breakpoint-list")}>
        <div className="debugger-pane-content ">
          <BreakpointListComponent service={service} />
        </div>
      </div>
    )
  }
}
