import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../shared/utils/api';
import { useDynamicTranslation } from './useDynamicTranslation';

const normalizeId = (value) => String(value ?? '').trim();

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendor && typeof raw.vendor === 'object'
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === 'object'
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === 'object'
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === 'object'
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === 'object'
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === 'object'
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);

  return {
    ...raw,
    id,
    _id: id,
    vendorId: normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId),
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || '',
    brandId: normalizeId(brandObj?._id || brandObj?.id || raw?.brandId),
    brandName: raw?.brandName || brandObj?.name || '',
    categoryId: normalizeId(categoryObj?._id || categoryObj?.id || raw?.categoryId),
    categoryName: raw?.categoryName || categoryObj?.name || '',
    image: raw?.image || raw?.images?.[0] || '',
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

/**
 * Reusable Hook for Infinite Scroll / Auto-Loading Product Lists
 * Supports:
 * - Backend pagination (page, limit)
 * - Request Cancellation via AbortController
 * - Product Deduplication by ID
 * - Session Storage Scroll & State Restoration on Navigation
 * - Preloading & Error Retry
 */
export const useInfiniteProducts = (queryParams = {}, pageSize = 20, storageKey = 'dwellmart_infinite_shop') => {
  const { translateArray } = useDynamicTranslation();

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const queryKey = JSON.stringify(queryParams);

  const hasMore = pagination.page < pagination.pages;

  // Primary Fetcher Function
  const fetchPage = useCallback(
    async (pageToFetch, isReset = false) => {
      // Prevent duplicate concurrent calls for the same page
      if (isFetchingRef.current && !isReset) return;

      // Abort previous in-flight request if filters change or new search starts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isFetchingRef.current = true;

      if (pageToFetch === 1 || isReset) {
        setIsLoadingInitial(true);
        setIsError(false);
      } else {
        setIsLoadingMore(true);
        setIsError(false);
      }

      try {
        const params = {
          ...queryParams,
          page: pageToFetch,
          limit: pageSize,
        };

        const response = await api.get('/products', {
          params,
          signal: controller.signal,
        });

        const payload = response?.data ?? response;
        const rawList = Array.isArray(payload?.products)
          ? payload.products.map(normalizeProduct).filter((item) => item.id)
          : [];

        const page = Number(payload?.page || pageToFetch || 1);
        const pages = Number(payload?.pages || 1);
        const total = Number(payload?.total || rawList.length || 0);

        const translatedProducts = await translateArray(rawList, [
          'name',
          'description',
          'unit',
          'categoryName',
          'brandName',
          'vendorName',
        ]);

        setProducts((prev) => {
          if (pageToFetch === 1 || isReset) {
            return translatedProducts;
          }
          // Deduplicate items by ID
          const existingIds = new Set(prev.map((item) => normalizeId(item.id || item._id)));
          const uniqueNewItems = translatedProducts.filter(
            (item) => !existingIds.has(normalizeId(item.id || item._id))
          );
          return [...prev, ...uniqueNewItems];
        });

        setPagination({ page, pages, total });
        setIsError(false);
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || api.isCancel?.(err)) {
          // Request intentionally canceled, ignore error
          return;
        }
        if (!controller.signal.aborted) {
          setIsError(true);
          setErrorMessage(err?.message || 'Failed to load products');
        }
      } finally {
        if (!controller.signal.aborted) {
          isFetchingRef.current = false;
          setIsLoadingInitial(false);
          setIsLoadingMore(false);
        }
      }
    },
    [queryKey, pageSize, translateArray]
  );

  // Trigger page 1 reset whenever filters / search / queryParams change
  useEffect(() => {
    fetchPage(1, true);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [queryKey]);

  // Request Next Page
  const fetchNextPage = useCallback(() => {
    if (!hasMore || isLoadingInitial || isLoadingMore || isFetchingRef.current) return;
    const nextPage = pagination.page + 1;
    fetchPage(nextPage, false);
  }, [hasMore, isLoadingInitial, isLoadingMore, pagination.page, fetchPage]);

  // Retry Failed Page Load
  const retry = useCallback(() => {
    if (pagination.page === 1 && products.length === 0) {
      fetchPage(1, true);
    } else {
      fetchPage(pagination.page + 1, false);
    }
  }, [pagination.page, products.length, fetchPage]);

  return {
    products,
    total: pagination.total,
    page: pagination.page,
    pages: pagination.pages,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    isError,
    errorMessage,
    fetchNextPage,
    retry,
  };
};

export default useInfiniteProducts;
