import PropTypes from 'prop-types';

export const AccordionPropTypes = {
  children: PropTypes.node.isRequired,
  type: PropTypes.oneOf(['single', 'multiple']),
  defaultExpandedId: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
  className: PropTypes.string,
};
