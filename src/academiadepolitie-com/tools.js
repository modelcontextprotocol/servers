/**
 * Tool Definitions pentru Remote MCP
 * Reutilizează backend-ul existent din /api/internal/modules/
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE_URL || 'https://www.academiadepolitie.com/api/internal';

class Tools {
  constructor() {
    this.toolDefinitions = [
      {
        name: 'get_student_data',
        description: 'Obține datele studentului conform API-ului modular intern',
        inputSchema: {
          type: 'object',
          properties: {
            user_profile: { type: 'boolean', description: 'Include profilul utilizatorului' },
            activitati_recente: { type: 'integer', minimum: 1, maximum: 10, description: 'Numărul de activități recente' },
            profil_comportamental: { type: 'boolean', description: 'Include profilul comportamental' },
            progres_teorie: { type: 'boolean', description: 'Include progresul la teorie' },
            analiza_lacunelor: { type: 'boolean', description: 'Include analiza lacunelor' },
            utilizatori_compatibili: { type: 'integer', minimum: 1, maximum: 10, description: 'Număr utilizatori compatibili pentru peer matching' },
            materie: { type: 'integer', description: 'ID-ul materiei pentru filtrare' },
            only: { type: 'string', enum: ['a_simulat_examenul', 'are_lacune_de_clarificat', 'a_citit_materia', 's_a_testat_pe_lectie_capitol', 'a_notat_la_lectii', 'are_provocari_sustinute', 'este_in_eroare_la'] },
            focus: { type: 'string', enum: ['toate', 'judet', 'an_admitere', 'judet_si_an'] },
            instructiuni_llm: { type: 'boolean', description: 'Transformă în instrucțiuni pentru LLM' },
            all_modules: { type: 'boolean', description: 'Include toate modulele disponibile' }
          },
          required: []
        }
      },
      {
        name: 'search_articles',
        description: 'Caută articole/lecții cu fuzzy matching pe titlu',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Termenul de căutare' },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
          },
          required: ['query']
        }
      },
      {
        name: 'get_article_content',
        description: 'Obține conținutul unei lecții/articol cu paginare (5000 cuvinte/pagină)',
        inputSchema: {
          type: 'object',
          properties: {
            article_id: { type: 'integer', description: 'ID-ul articolului' },
            page: { type: 'integer', minimum: 1, default: 1, description: 'Numărul paginii' }
          },
          required: ['article_id']
        }
      },
      {
        name: 'add_note',
        description: 'Adaugă o notiță la un articol/lecție',
        inputSchema: {
          type: 'object',
          properties: {
            article_id: { type: 'integer', description: 'ID-ul articolului' },
            note_content: { type: 'string', description: 'Conținutul notiței' }
          },
          required: ['article_id', 'note_content']
        }
      },
      {
        name: 'send_challenge',
        description: 'Trimite o provocare unui alt utilizator pentru competiție',
        inputSchema: {
          type: 'object',
          properties: {
            to_user_id: { type: 'integer', description: 'ID-ul utilizatorului căruia îi trimiți provocarea' },
            subject_grile_id: { type: 'integer', description: 'ID-ul materiei pentru provocare' },
            nr_questions: { type: 'integer', minimum: 5, maximum: 30, default: 10 },
            message: { type: 'string', description: 'Mesaj opțional pentru provocare' }
          },
          required: ['to_user_id', 'subject_grile_id']
        }
      },
      {
        name: 'update_reading_progress',
        description: 'Actualizează progresul de citire pentru un articol',
        inputSchema: {
          type: 'object',
          properties: {
            article_id: { type: 'integer', description: 'ID-ul articolului' },
            progress: { type: 'integer', minimum: 0, maximum: 100, description: 'Procentul citit (0-100)' },
            pages_read: { type: 'array', items: { type: 'integer' }, description: 'Array cu paginile citite' }
          },
          required: ['article_id', 'progress']
        }
      },
      {
        name: 'save_generated_quiz',
        description: 'Salvează quiz-uri generate de LLM în baza de date',
        inputSchema: {
          type: 'object',
          properties: {
            article_id: { type: 'integer', description: 'ID-ul articolului pe baza căruia s-a generat' },
            subject_grile_id: { type: 'integer', description: 'ID-ul categoriei de grile' },
            model: { type: 'string', description: 'Modelul LLM folosit' },
            questions: {
              type: 'array',
              maxItems: 10,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Textul întrebării' },
                  options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                  correct_answer: { type: 'integer', minimum: 1, maximum: 4 },
                  explanation: { type: 'string', description: 'Explicația răspunsului corect' }
                },
                required: ['title', 'options', 'correct_answer', 'explanation']
              }
            }
          },
          required: ['article_id', 'subject_grile_id', 'model', 'questions']
        }
      }
    ];
  }
  
  getToolDefinitions() {
    return this.toolDefinitions;
  }
  
  async executeTool(toolName, args, progressCallback) {
    // Extract user context
    const user = args._user;
    delete args._user;
    
    // Build request pentru backend
    const params = new URLSearchParams({
      user_id: user.id || user.userId,
      jwt_token: user.api_token || user.token || ''
    });
    
    // Toate tool-urile cu acțiuni primesc flag în URL (similar cu ChatGPT pattern)
    const toolsWithFlag = ['search_articles', 'get_article_content', 'add_note', 'send_challenge', 'update_reading_progress', 'save_generated_quiz'];
    if (toolsWithFlag.includes(toolName)) {
      params.append(toolName, '1');
    }
    
    // Pentru tool-uri care necesită POST data (toate action tools)
    const postTools = ['search_articles', 'get_article_content', 'add_note', 'send_challenge', 'update_reading_progress', 'save_generated_quiz'];
    
    let requestOptions = {
      method: postTools.includes(toolName) ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RemoteMCP/1.0'
      },
      timeout: parseInt(process.env.API_TIMEOUT) || 30000
    };
    
    // Pentru remote calls, totul merge la profile_for_conversation.php cu tool flags
    // Similar cu pattern-ul ChatGPT wrapper-urilor
    let url = `${API_BASE}/profile_for_conversation.php?${params}`;
    
    // DEBUG: Log request details
    console.log('=== MCP Tool Request DEBUG ===');
    console.log('URL:', url);
    console.log('Method:', requestOptions.method);
    console.log('Headers:', JSON.stringify(requestOptions.headers, null, 2));
    console.log('User object:', JSON.stringify(user, null, 2));
    console.log('================================');
    
    if (postTools.includes(toolName)) {
      // Convert args to POST data
      const postData = new URLSearchParams();
      
      switch(toolName) {
        case 'search_articles':
          postData.append('query', args.query);
          postData.append('limit', args.limit || 10);
          break;
        case 'get_article_content':
          postData.append('article_id', args.article_id);
          postData.append('page', args.page || 1);
          break;
        case 'add_note':
          postData.append('article_id', args.article_id);
          postData.append('note_content', args.note_content);
          break;
        case 'send_challenge':
          postData.append('to_user_id', args.to_user_id);
          postData.append('subject_grile_id', args.subject_grile_id);
          postData.append('nr_questions', args.nr_questions || 10);
          if (args.message) postData.append('message', args.message);
          break;
        case 'update_reading_progress':
          postData.append('article_id', args.article_id);
          postData.append('progress', args.progress);
          if (args.pages_read) {
            postData.append('pages_read', JSON.stringify(args.pages_read));
          }
          break;
        case 'save_generated_quiz':
          postData.append('article_id', args.article_id);
          postData.append('subject_grile_id', args.subject_grile_id);
          postData.append('model', args.model);
          postData.append('questions', JSON.stringify(args.questions));
          break;
      }
      
      requestOptions.body = postData.toString();
      console.log('POST Body:', requestOptions.body);
    } else {
      // Pentru GET requests (get_student_data)
      Object.keys(args).forEach(key => {
        if (args[key] !== undefined && args[key] !== null) {
          params.append(key, args[key]);
        }
      });
      url = `${API_BASE}/profile_for_conversation.php?${params}`;
    }
    
    // Report progress
    if (progressCallback) {
      progressCallback({
        status: 'calling_api',
        tool: toolName,
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (progressCallback) {
        progressCallback({
          status: 'completed',
          tool: toolName,
          timestamp: new Date().toISOString()
        });
      }
      
      return {
        tool: toolName,
        success: true,
        data: result
      };
      
    } catch (error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }
}

export const tools = new Tools();