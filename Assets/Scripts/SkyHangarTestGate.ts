// SkyHangarTestGate.ts
// Owns: the ONE switch for LEAF testing. Off (default): the LEAF Plugin Bridge and LeafIndex objects stay disabled,
// so nothing can run a scenario and LEAF never draws its debug strip or report overlay (preview and recordings are clean).
// On: tick "Enable LEAF tests" here, then push / run scenarios from the LEAF panel.

@component
export class SkyHangarTestGate extends BaseScriptComponent {
  @input
  @hint("Turn on LEAF test support (LEAF Plugin Bridge + LeafIndex). Leave OFF for normal runs and recordings.")
  enableTests: boolean = false
  @input
  @hint("Objects that belong to LEAF: LEAF Plugin Bridge and LeafIndex")
  leafObjects: SceneObject[] = []

  onAwake(): void {
    for (const o of this.leafObjects) if (o) o.enabled = this.enableTests
    // The editor also adds its own "LEAF Plugin Bridge" object to the scene; in normal runs it stays off too, so no LEAF strip or report text can draw.
    if (!this.enableTests) for (let i = 0; i < global.scene.getRootObjectsCount(); i++) this.hideLeaf(global.scene.getRootObject(i))
  }

  private hideLeaf(o: SceneObject): void {
    if (o.name === "LEAF Plugin Bridge" || o.name === "LeafIndex") o.enabled = false
    for (let i = 0; i < o.getChildrenCount(); i++) this.hideLeaf(o.getChild(i))
  }
}
