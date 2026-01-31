import type { AIService } from "../../types";

export interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Omit<AIService, "id" | "createdAt" | "updatedAt" | "displayOrder">) => void;
  editingService?: AIService | null;
  disabled?: boolean;
}
