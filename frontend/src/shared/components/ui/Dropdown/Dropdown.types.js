import PropTypes from 'prop-types';

export const DropdownPropTypes = {
  trigger: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  position: PropTypes.oneOf(['bottom-left', 'bottom-right', 'top-left', 'top-right']),
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  className: PropTypes.string,
};
