export interface DocumentItem {
  id: number;
  filename: string;
  source_path: string;
  status: string;
  priority: string;
  error_message?: string;
  created_at: string;
}
