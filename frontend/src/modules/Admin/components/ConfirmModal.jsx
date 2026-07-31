/**
 * @deprecated Admin/components/ConfirmModal.jsx
 * Migrated to use shared DS Modal primitive.
 * Preserves the original API (isOpen, onClose, onConfirm, title, message, confirmText, cancelText, isLoading)
 * so all existing Admin call sites continue to work without changes.
 */
import Modal from '../../../shared/components/ui/Modal/Modal';
import DSButton from '../../../shared/components/ui/Button/Button';

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  isDanger = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={!isLoading ? onClose : undefined}
      title={title}
      variant={isDanger ? 'danger' : 'confirmation'}
      size="sm"
      isLoading={isLoading}
    >
      <Modal.Body>
        <p className="text-textColor-secondary text-sm leading-relaxed">{message}</p>
      </Modal.Body>
      <Modal.Footer>
        <Modal.Actions>
          <DSButton
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </DSButton>
          <DSButton
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </DSButton>
        </Modal.Actions>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmModal;
