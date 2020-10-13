import type { IDebugService } from "../types"

import classnames from "classnames"
import { Block } from "@atom-ide-community/nuclide-commons-ui/Block"
import * as React from "react"
import DebuggerProcessComponent from "./DebuggerProcessComponent"

export default function DebuggerProcessTreeView(props: { service: IDebugService }): React.Node {
  return (
    <div className={classnames("debugger-container-new", "debugger-breakpoint-list", "debugger-tree")}>
      <div className="debugger-pane-content ">
        <Block>
          <DebuggerProcessComponent service={props.service} />
        </Block>
      </div>
    </div>
  )
}
