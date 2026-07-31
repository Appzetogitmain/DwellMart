import PropTypes from 'prop-types';

export const PaginationPropTypes = {
  currentPage: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  pageSize: PropTypes.number,
  totalItems: PropTypes.number,
  onPageSizeChange: PropTypes.func,
  showSizeChanger: PropTypes.bool,
  pageSizeOptions: PropTypes.arrayOf(PropTypes.number),
  className: PropTypes.string,
};
