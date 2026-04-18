export interface DocumentItem {
  id: number;
  filename: string;
  source_path: string;
  status: string;
  priority: string;
  error_message?: string;
  created_at: string;
  current_page?: number | null;
  total_pages?: number | null;
  current_document_percent?: number | null;
  current_document_index?: number | null;
  completed_docs?: number | null;
  total_docs?: number | null;
  remaining_docs?: number | null;
  overall_percent?: number | null;
  updated_at?: string | null;
}
