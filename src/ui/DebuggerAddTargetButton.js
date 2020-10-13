import * as React from "react"
import { ButtonGroup } from "@atom-ide-community/nuclide-commons-ui/ButtonGroup"
import { Dropdown } from "@atom-ide-community/nuclide-commons-ui/Dropdown"
import { goToLocation } from "@atom-ide-community/nuclide-commons-atom/go-to-location"

const DEVICE_PANEL_URL = "atom://nuclide/devices"

export function AddTargetButton(className: string) {
  return (
    <ButtonGroup className={className}>
      <Dropdown
        className="debugger-stepping-svg-button"
        tooltip={{
          title: "Start debugging an additional debug target...",
        }}
        options={[
          { label: "Add target...", value: null, hidden: true },
          { label: "Attach debugger...", value: "attach" },
          { label: "Launch debugger...", value: "launch" },
          { label: "Manage devices...", value: "devices" },
        ]}
        onChange={(value) => {
          switch (value) {
            case "attach": {
              atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show-attach-dialog")
              break
            }
            case "launch": {
              atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show-launch-dialog")
              break
            }
            case "devices": {
              goToLocation(DEVICE_PANEL_URL)
              break
            }
            default:
              break
          }
        }}
      />
    </ButtonGroup>
  )
}
