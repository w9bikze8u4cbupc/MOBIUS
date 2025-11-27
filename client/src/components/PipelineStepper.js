import React from "react";
import "../styles/pipeline.css";

export function PipelineStepper({ steps, activeStepId, completedStepIds, onStepClick, onConfirmStep }) {
  return (
    <div className="pipeline-stepper">
      {steps.map((step, idx) => {
        const isCompleted = completedStepIds.includes(step.id);
        const isActive = step.id === activeStepId;
        const isLocked = !isActive && !isCompleted && idx > steps.findIndex((s) => s.id === activeStepId);

        return (
          <div
            key={step.id}
            className={`pipeline-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""} ${
              isLocked ? "locked" : ""
            }`}
            onClick={() => {
              if (isCompleted) {
                onStepClick(step.id);
              }
            }}
          >
            <div className="pipeline-step-index">{idx + 1}</div>
            <div className="pipeline-step-content">
              <div className="pipeline-step-label">{step.label}</div>
              <div className="pipeline-step-status">
                {isCompleted ? "Confirmed" : isActive ? "Active" : isLocked ? "Locked" : "Pending"}
              </div>
            </div>
            {isActive && (
              <button className="pipeline-confirm-btn" onClick={() => onConfirmStep(step.id)}>
                CONFIRM {step.label.toUpperCase()}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
