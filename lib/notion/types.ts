export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "select"
  | "status"
  | "multi_select"
  | "date"
  | "people"
  | "relation"
  | "checkbox"
  | "email"
  | "phone_number"
  | "url";

export type LevitoEntity = "members" | "initiatives" | "knowledge" | "decisions" | "actions" | "handovers";

export interface FieldMapping {
  field: string;
  propertyId: string;
  propertyType: NotionPropertyType;
  required: boolean;
  writable: boolean;
  options?: Record<string, string>;
  relationTarget?: LevitoEntity;
}

export interface DataSourceMapping {
  entity: LevitoEntity;
  dataSourceId: string;
  fields: FieldMapping[];
}

export interface NotionWorkspaceMapping {
  schemaVersion: number;
  notionVersion: string;
  sources: DataSourceMapping[];
}

export type NotionAdapterStatus =
  | { state: "not_implemented"; credentialsDetected: boolean; message: string }
  | { state: "connected"; mapping: NotionWorkspaceMapping };
