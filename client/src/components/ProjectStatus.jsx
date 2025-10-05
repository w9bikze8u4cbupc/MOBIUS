import { mapStatusToSteps } from '../utils/transforms';

export function ProjectStatus({ status, isLive }) {
  const steps = mapStatusToSteps(status);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Production Pipeline</h2>
        {isLive && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <span className="absolute flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="ml-2">Live</span>
          </span>
        )}
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className={`flex flex-col rounded border px-3 py-2 ${
              step.completed ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{step.label}</span>
              <span className="text-xs uppercase tracking-wide">
                {step.completed ? 'Completed' : 'Pending'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}