import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Full sweep form with all 250+ questions
    const formData = await fetch('https://media.base44.com/files/public/69c3395b7c5b25bd9cda1d6e/739728391_SweepForm1.json').then(r => r.json());
    const units = formData.FormData.definition.definition.rootSection.units;
    
    // Map field types to question types
    const typeMap = {
      'Dropdown': 'select',
      'Checkbox': 'yes_no',
      'Text': 'text',
      'Picture': 'photo',
      'Rating': 'rating'
    };

    const questions = units.map((unit, idx) => ({
      category: 'other',
      question_text: unit.name || '',
      question_type: typeMap[unit.fieldType] || 'text',
      answer_options: unit.values ? unit.values.join(',') : '',
      sort_order: idx + 1,
      required_flag: unit.isRequired || false,
      help_text: unit.description || '',
      is_active: true
    })).filter(q => q.question_text.trim());

    // Bulk create the questions
    const result = await base44.asServiceRole.entities.InspectionQuestion.bulkCreate(questions);

    return Response.json({ 
      success: true, 
      imported: result.length,
      message: `Successfully imported ${result.length} questions from sweep form`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});