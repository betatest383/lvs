import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Shared return-navigation hook for inspection workflow pages.
 * Returns to Job Hub when a jobId is known, otherwise falls back to today's jobs.
 *
 * @param {string} [jobIdOverride] — explicit job id (e.g. from local state)
 */
export function useInspectionReturn(jobIdOverride) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawJobId = jobIdOverride || searchParams.get('job_id');
  const jobId = rawJobId && !['undefined', 'null', ''].includes(String(rawJobId).trim()) ? rawJobId : null;

  const goBack = () => {
    if (jobId) {
      navigate(`/tech/job-hub/${jobId}`);
    } else {
      navigate('/tech/job-hub');
    }
  };

  return { jobId, goBack };
}