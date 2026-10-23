import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import GuidedTrainingPlayer from '@/components/training/GuidedTrainingPlayer';
import { toast } from 'sonner';

export default function GuidedTrainingPage() {
  const { trainingId } = useParams();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') || '';
  const navigate = useNavigate();
  const [guide, setGuide] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('manageTraining', {
          action: 'get',
          trainingId,
        });
        if (res.data?.success) {
          setGuide(res.data.guide);
        } else {
          toast.error(res.data?.error || 'Failed to load guide');
          navigate('/lvcos/training/registry');
          return;
        }

        const progRes = await base44.functions.invoke('manageTraining', {
          action: 'get_progress',
          trainingId,
        });
        if (progRes.data?.success) {
          setProgress(progRes.data.progress);
        }
      } catch {
        toast.error('Failed to load training');
        navigate('/lvcos/training/registry');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [trainingId]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'start_training',
        trainingId,
        taskId: taskId || undefined,
      });
      if (res.data?.success) {
        setProgress(res.data.progress);
        toast.success('Training started');
      } else {
        toast.error(res.data?.error || 'Failed to start training');
      }
    } catch {
      toast.error('Failed to start training');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  if (!guide) return null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/lvcos/training/detail/${trainingId}`)}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Guide
      </Button>

      {progress ? (
        <GuidedTrainingPlayer
          guide={guide}
          progress={progress}
          taskId={taskId}
        />
      ) : (
        <div className="text-center py-12 space-y-4">
          <h2 className="text-xl font-bold">{guide.title || guide.training_name}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {guide.description}
          </p>
          {guide.learning_objective && (
            <p className="text-sm max-w-md mx-auto">
              <span className="font-medium">Learning Objective:</span> {guide.learning_objective}
            </p>
          )}
          <Button
            onClick={handleStart}
            disabled={starting}
            size="lg"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {starting ? 'Starting...' : 'Start Guided Training'}
          </Button>
        </div>
      )}
    </div>
  );
}