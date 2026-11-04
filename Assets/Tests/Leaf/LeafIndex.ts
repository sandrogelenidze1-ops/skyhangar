// LeafIndex.ts — registers the SkyHangar LEAF scenarios (one or more per done criterion).
import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {SH_C1_Markers} from "./Scenarios/SH_C1_Markers"
import {SH_C1_EdgeArrow} from "./Scenarios/SH_C1_EdgeArrow"
import {SH_C2_AimTrail} from "./Scenarios/SH_C2_AimTrail"
import {SH_C2_TapCard} from "./Scenarios/SH_C2_TapCard"
import {SH_C2_TapVsHold} from "./Scenarios/SH_C2_TapVsHold"
import {SH_C3_CollectHook} from "./Scenarios/SH_C3_CollectHook"
import {SH_C3_CollectRealInput} from "./Scenarios/SH_C3_CollectRealInput"
import {SH_C4_Radar} from "./Scenarios/SH_C4_Radar"
import {SH_C5_ThrowHook} from "./Scenarios/SH_C5_ThrowHook"
import {SH_C5_ThrowRealInput} from "./Scenarios/SH_C5_ThrowRealInput"
import {SH_N_TrailRoute} from "./Scenarios/SH_N_TrailRoute"
import {SH_N_AimReticle} from "./Scenarios/SH_N_AimReticle"
import {SH_N_MarkerGlyphs} from "./Scenarios/SH_N_MarkerGlyphs"
import {SH_N_SkyPad} from "./Scenarios/SH_N_SkyPad"
import {SH_N_HangarPaging} from "./Scenarios/SH_N_HangarPaging"
import {SH_N_CardFollow} from "./Scenarios/SH_N_CardFollow"
import {SH_N1_MenuToggles} from "./Scenarios/SH_N1_MenuToggles"
import {SH_N_MenuInView} from "./Scenarios/SH_N_MenuInView"
import {SH_M1_Models} from "./Scenarios/SH_M1_Models"
import {SH_M3_ModelDetail} from "./Scenarios/SH_M3_ModelDetail"
import {SH_M7_Variety} from "./Scenarios/SH_M7_Variety"
import {SH_P1_Perf} from "./Scenarios/SH_P1_Perf"
import {SH_T8_InputRules} from "./Scenarios/SH_T8_InputRules"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "c1_markers", typename: SH_C1_Markers.getTypeName()},
    {id: "c1_edge_arrow", typename: SH_C1_EdgeArrow.getTypeName()},
    {id: "c2_aim_trail", typename: SH_C2_AimTrail.getTypeName()},
    {id: "c2_tap_card", typename: SH_C2_TapCard.getTypeName()},
    {id: "c2_tap_vs_hold", typename: SH_C2_TapVsHold.getTypeName()},
    {id: "c3_collect_hook", typename: SH_C3_CollectHook.getTypeName()},
    {id: "c3_collect_real", typename: SH_C3_CollectRealInput.getTypeName()},
    {id: "c4_radar", typename: SH_C4_Radar.getTypeName()},
    {id: "c5_throw_hook", typename: SH_C5_ThrowHook.getTypeName()},
    {id: "c5_throw_real", typename: SH_C5_ThrowRealInput.getTypeName()},
    {id: "n_trail_route", typename: SH_N_TrailRoute.getTypeName()},
    {id: "n_aim_reticle", typename: SH_N_AimReticle.getTypeName()},
    {id: "n_marker_glyphs", typename: SH_N_MarkerGlyphs.getTypeName()},
    {id: "n_sky_pad", typename: SH_N_SkyPad.getTypeName()},
    {id: "n_hangar_paging", typename: SH_N_HangarPaging.getTypeName()},
    {id: "n_card_follow", typename: SH_N_CardFollow.getTypeName()},
    {id: "n1_menu_toggles", typename: SH_N1_MenuToggles.getTypeName()},
    {id: "n_menu_in_view", typename: SH_N_MenuInView.getTypeName()},
    {id: "m1_models", typename: SH_M1_Models.getTypeName()},
    {id: "m3_model_detail", typename: SH_M3_ModelDetail.getTypeName()},
    {id: "m7_variety", typename: SH_M7_Variety.getTypeName()},
    {id: "p1_perf", typename: SH_P1_Perf.getTypeName()},
    {id: "t8_input_rules", typename: SH_T8_InputRules.getTypeName()},
  ]
}
