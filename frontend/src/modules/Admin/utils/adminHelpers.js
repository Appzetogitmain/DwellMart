// Format currency for admin display
export const formatCurrency = (amount) => {
  const val = Number(amount || 0);
  return `₹${val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Format date for admin display
export const formatDate = (date, options = {}) => {
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };
  return new Date(date).toLocaleDateString('en-US', defaultOptions);
};

// Format date and time
export const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Calculate percentage change
export const calculatePercentageChange = (oldValue, newValue) => {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
};

// Get status color
export const getStatusColor = (status) => {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    low_stock: 'bg-orange-100 text-orange-800',
    in_stock: 'bg-green-100 text-green-800',
    out_of_stock: 'bg-red-100 text-red-800',
  };
  return statusColors[status] || 'bg-gray-100 text-gray-800';
};

// Generate CSV from data
export const generateCSV = (data, headers, filename) => {
  // Create header row
  const headerRow = headers.map((h) => `"${h.label}"`).join(',');
  
  // Create data rows
  const dataRows = data.map((row) => {
    return headers.map((header) => {
      const value = header.accessor(row);
      // Escape quotes and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });

  // Combine header and data
  const csvContent = [headerRow, ...dataRows].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Calculate date ranges
export const getDateRange = (period) => {
  const now = new Date();
  const ranges = {
    today: {
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    },
    week: {
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now,
    },
    month: {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
    },
    year: {
      start: new Date(now.getFullYear(), 0, 1),
      end: now,
    },
  };
  return ranges[period] || ranges.month;
};

// Filter data by date range
export const filterByDateRange = (data, startDate, endDate, dateField = 'date') => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // Include entire end date

  return data.filter((item) => {
    const itemDate = new Date(item[dateField]);
    return itemDate >= start && itemDate <= end;
  });
};

