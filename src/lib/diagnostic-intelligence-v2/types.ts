import type { FaultType, ProductAnalysisAttribute } from "../product-analysis/types.ts";
import type { ResolvedProductIdentity } from "../product-intelligence/types.ts";

export type DiagnosticV2Status="confirmed"|"probable"|"ambiguous"|"insufficient_data";
export type DiagnosticFault=FaultType|"rear_glass_damage"|"camera_issue"|"boot_loop"|"no_display"|"keyboard_issue"|"ram_issue"|"hinge_damage"|"disc_drive_issue"|"stick_drift"|"button_issue"|"usb_port_issue"|"trigger_issue"|"connectivity_issue"|"no_backlight"|"no_image"|"panel_damage"|"mainboard_issue"|"power_board_issue"|"tcon_issue"|"sound_only"|"power_instability";
export type DiagnosticEvidence={source:"title"|"description"|"attribute"|"detected_fault";text:string;normalizedSignal:DiagnosticFault|"condition_only";weight:number;polarity:"positive"|"negative"};
export type DiagnosticAssessment={fault:DiagnosticFault;classification:"explicit_fault"|"inferred_fault"|"unknown_fault";confidence:number;evidence:DiagnosticEvidence[]};
export type DiagnosticRepairScenario={fault:DiagnosticFault;probableCause:string;repairAction:string;requiredPartType?:string|null;probability?:number|null;diagnosticConfidence:number;explanation:string};
export type DiagnosticIntelligenceV2Input={title:string;description?:string|null;attributes?:Record<string,ProductAnalysisAttribute>|null;productIdentity:ResolvedProductIdentity;detectedFaults?:FaultType[]|null};
export type DiagnosticIntelligenceV2Result={status:DiagnosticV2Status;primaryDiagnostic:DiagnosticAssessment|null;alternativeDiagnostics:DiagnosticAssessment[];repairScenarios:DiagnosticRepairScenario[];evidence:DiagnosticEvidence[];confidence:number|null;warnings:string[]};
