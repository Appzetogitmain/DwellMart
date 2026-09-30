import { useEffect, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiCheck, FiSearch, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { getImageUrl } from '../../../../shared/utils/helpers';
import { getAdminHomepageSections, publishAdminHomepageSections } from '../../services/adminService';
import { usePermission } from '../../hooks/usePermission';
import { DEFAULT_HOME_SECTIONS } from '../../../UserApp/data/homeSections';

const responseData = (response) => response?.data?.data ?? response?.data ?? null;
const productsFrom = (response) => {
  const payload = responseData(response);
  return Array.isArray(payload?.products) ? payload.products : [];
};
const idOf = (product) => String(product?._id || product?.id || '');
const activeProducts = (params = {}) => api.get('/admin/marketing/homepage-products', { params });

const HomepageSections = () => {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('offers.edit');
  const [sections, setSections] = useState(DEFAULT_HOME_SECTIONS);
  const [knownProducts, setKnownProducts] = useState({});
  const [activeKey, setActiveKey] = useState(DEFAULT_HOME_SECTIONS[0].key);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const config = responseData(await getAdminHomepageSections())?.sections;
        if (!live) return;
        const saved = Array.isArray(config) ? config.map((section) => ({ ...section, limit: 6 })) : DEFAULT_HOME_SECTIONS;
        const ids = saved.flatMap((section) => section.pinnedIds || []);
        const pinned = ids.length ? productsFrom(await activeProducts({ ids: ids.join(',') })) : [];
        if (!live) return;
        setSections(saved);
        setKnownProducts(Object.fromEntries(pinned.map((product) => [idOf(product), product])));
      } catch {
        if (live) toast.error('Could not load homepage sections. Please try again.');
      } finally {
        if (live) setLoading(false);
      }
    };
    load();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = productsFrom(await activeProducts({ search: query.trim() || undefined }));
        if (live) {
          setResults(found);
          setKnownProducts((current) => ({ ...current, ...Object.fromEntries(found.map((product) => [idOf(product), product])) }));
        }
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) setSearching(false);
      }
    }, query.trim() ? 300 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [query, loading]);

  const active = sections.find((section) => section.key === activeKey) || sections[0];
  const update = (key, changes) => {
    setSections((current) => current.map((section) => section.key === key ? { ...section, ...changes, limit: 6 } : section));
    setDirty(true);
  };
  const move = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    setSections((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setDirty(true);
  };
  const togglePin = (product) => {
    if (!canEdit) return;
    const id = idOf(product);
    const currentPins = active.pinnedIds || [];
    if (currentPins.includes(id)) return update(active.key, { pinnedIds: currentPins.filter((value) => value !== id) });
    if (sections.some((section) => section.key !== active.key && section.pinnedIds?.includes(id))) return toast.error('This product is already pinned in another section.');
    if (currentPins.length >= 6) return toast.error('A section can have at most six pinned products.');
    setKnownProducts((current) => ({ ...current, [id]: product }));
    update(active.key, { pinnedIds: [...currentPins, id] });
  };
  const movePin = (index, direction) => {
    const nextIndex = index + direction;
    const ids = [...(active.pinnedIds || [])];
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    update(active.key, { pinnedIds: ids });
  };
  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      await publishAdminHomepageSections(sections.map((section) => ({ ...section, limit: 6 })));
      setDirty(false);
      toast.success('Homepage sections published.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not publish homepage sections.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-5 text-gray-600">Loading homepage sections...</div>;
  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 text-gray-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h1 className="text-2xl font-bold">Homepage Sections</h1><p className="mt-1 text-sm text-gray-600">Arrange, show, and curate the six homepage product rows.</p></div>
        {canEdit && <button type="button" onClick={save} disabled={!dirty || saving} className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-50">{saving ? 'Publishing...' : 'Publish changes'}</button>}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:gap-5 items-start">
        <aside className="rounded-xl border bg-white p-3 space-y-2"><h2 className="px-2 py-1 font-semibold">Display order</h2><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {sections.map((section, index) => <div key={section.key} className={`flex min-w-0 items-center gap-2 rounded-lg border p-2 ${section.key === activeKey ? 'border-amber-500 bg-amber-50' : 'border-gray-200'}`}><button type="button" onClick={() => { setActiveKey(section.key); setQuery(''); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{index + 1}. {section.title}</span><span className="text-xs text-gray-500">{section.enabled ? section.mode.replaceAll('_', ' ') : 'Hidden'}</span></button>{canEdit && <div className="flex shrink-0 flex-col"><button type="button" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => move(index, -1)} className="p-1 disabled:opacity-30"><FiArrowUp /></button><button type="button" aria-label={`Move ${section.title} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)} className="p-1 disabled:opacity-30"><FiArrowDown /></button></div>}</div>)}
        </div></aside>

        {active && <main className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold truncate">{active.title}</h2><label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={active.enabled} disabled={!canEdit} onChange={(event) => update(active.key, { enabled: event.target.checked })} /> Show section</label></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="min-w-0 text-sm font-medium">Heading<input className="mt-1 w-full min-w-0 border rounded-lg p-2 font-normal" maxLength={80} value={active.title} disabled={!canEdit} onChange={(event) => update(active.key, { title: event.target.value })} /></label><label className="min-w-0 text-sm font-medium">Subtitle<input className="mt-1 w-full min-w-0 border rounded-lg p-2 font-normal" maxLength={180} value={active.subtitle} disabled={!canEdit} onChange={(event) => update(active.key, { subtitle: event.target.value })} /></label><label className="min-w-0 text-sm font-medium sm:col-span-2">Selection mode<select className="mt-1 w-full min-w-0 border rounded-lg p-2 font-normal" value={active.mode} disabled={!canEdit} onChange={(event) => update(active.key, { mode: event.target.value })}><option value="automatic">Automatic</option><option value="pinned_and_auto">Pinned first, then automatic</option><option value="manual">Pinned only</option></select></label></div>
          <p className="text-xs text-gray-500">Pinned products can be any active product. Automatic filling continues to use the normal section rules.</p>
          {active.mode === 'manual' && !active.pinnedIds.length && <p className="text-sm text-amber-700">This row will be empty until you pin a product.</p>}
          <section><h3 className="mb-2 font-semibold">Pinned products</h3>{active.pinnedIds.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : <div className="space-y-2">{active.pinnedIds.map((id, index) => <div key={id} className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 border p-2 text-sm"><span className="min-w-0 flex-1 truncate">{index + 1}. {knownProducts[id]?.name || 'Active product unavailable'}</span>{canEdit && <div className="flex shrink-0 items-center"><button type="button" aria-label="Move pin up" disabled={index === 0} onClick={() => movePin(index, -1)} className="p-1 disabled:opacity-30"><FiArrowUp /></button><button type="button" aria-label="Move pin down" disabled={index === active.pinnedIds.length - 1} onClick={() => movePin(index, 1)} className="p-1 disabled:opacity-30"><FiArrowDown /></button><button type="button" aria-label="Remove pin" onClick={() => update(active.key, { pinnedIds: active.pinnedIds.filter((value) => value !== id) })} className="p-1"><FiX /></button></div>}</div>)}</div>}</section>
          {canEdit && <section><h3 className="mb-2 font-semibold">Find active products to pin</h3><div className="relative"><FiSearch className="absolute left-3 top-3 text-gray-500" /><input className="w-full min-w-0 border rounded-lg py-2 pl-9 pr-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by product name or SKU" /></div><div className="mt-3 max-h-80 overflow-auto divide-y rounded-lg border">{searching && <div className="p-3 text-sm text-gray-500">Searching...</div>}{!searching && results.length === 0 && <div className="p-3 text-sm text-gray-500">No active products found.</div>}{!searching && results.map((product) => <div key={idOf(product)} className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><img src={getImageUrl(product.image || product.mainImage || product.images?.[0])} alt="" className="h-11 w-11 shrink-0 rounded bg-gray-100 object-cover" /><span className="min-w-0 break-words text-sm">{product.name}</span></div><button type="button" onClick={() => togglePin(product)} className="shrink-0 rounded border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 sm:border-0 sm:p-0">{active.pinnedIds.includes(idOf(product)) ? <span className="inline-flex items-center gap-1"><FiCheck /> Pinned</span> : 'Pin'}</button></div>)}</div></section>}
        </main>}
      </div>
    </div>
  );
};

export default HomepageSections;
