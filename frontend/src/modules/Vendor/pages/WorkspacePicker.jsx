import { FiShoppingBag, FiPackage, FiZap, FiPauseCircle } from 'react-icons/fi';
import { Navigate, useNavigate } from 'react-router-dom';
import { useVendorWorkspace, withWorkspace, WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';

const icons = { retail: FiShoppingBag, wholesale: FiPackage, quick_commerce: FiZap };

const WorkspacePicker = () => {
  const navigate = useNavigate();
  // Defect 7: Use readableWorkspaces (active + paused) so a paused-only vendor
  // can still reach their existing orders through normal UI.
  const { activeWorkspaces, readableWorkspaces } = useVendorWorkspace();
  // Auto-redirect when there is only one readable workspace (which may be paused)
  if (readableWorkspaces.length === 1) return <Navigate to={withWorkspace('/vendor/dashboard', readableWorkspaces[0])} replace />;
  return (
    <section className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-slate-900">Choose a workspace</h1>
      <p className="mt-2 text-slate-600">Each workspace keeps its own products, orders, and operational tools.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-7">
        {readableWorkspaces.map((workspace) => {
          const Icon = icons[workspace] || FiShoppingBag;
          const isPaused = !activeWorkspaces.includes(workspace);
          return (
            <button key={workspace} type="button"
              onClick={() => { sessionStorage.setItem('vendor-last-workspace', workspace); navigate(withWorkspace('/vendor/dashboard', workspace)); }}
              className={`text-left rounded-2xl border p-6 shadow-sm transition ${
                isPaused
                  ? 'border-amber-300 bg-amber-50 hover:border-amber-500 hover:shadow-md'
                  : 'border-slate-200 bg-white hover:border-amber-400 hover:shadow-md'
              }`}>
              <div className="flex items-center justify-between">
                <Icon className={`text-3xl ${isPaused ? 'text-amber-400' : 'text-amber-500'}`} />
                {isPaused && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    <FiPauseCircle className="text-sm" /> Paused
                  </span>
                )}
              </div>
              <h2 className="mt-4 font-bold text-slate-900">{WORKSPACE_LABELS[workspace]}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isPaused ? 'View existing orders (paused — no new orders)' : 'Open workspace'}
              </p>
            </button>
          );
        })}
      </div>
      {readableWorkspaces.length === 0 && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-800">No channel is active yet. You can review channel applications from your profile after approval.</p>}
    </section>
  );
};

export default WorkspacePicker;
