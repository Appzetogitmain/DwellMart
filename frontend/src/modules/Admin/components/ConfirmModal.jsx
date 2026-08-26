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
  type,
  customContent,
  confirmDisabled = false,
}) => {
  const isDangerCalculated = isDanger || type === 'danger';
  const isSuccess = type === 'success';

  const modalVariant = isSuccess ? 'success' : isDangerCalculated ? 'danger' : 'confirmation';
  const buttonVariant = isSuccess ? 'success' : isDangerCalculated ? 'danger' : 'primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={!isLoading ? onClose : undefined}
      title={title}
      variant={modalVariant}
      size="sm"
      isLoading={isLoading}
    >
      <Modal.Body>
        {message && <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{message}</p>}
        {customContent}
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
            variant={buttonVariant}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={confirmDisabled || isLoading}
          >
            {confirmText}
          </DSButton>
        </Modal.Actions>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmModal;
