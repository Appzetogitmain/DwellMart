import PropTypes from 'prop-types';

export const TabsPropTypes = {
  activeTab: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['default', 'line', 'pills']),
  fullWidth: PropTypes.bool,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
