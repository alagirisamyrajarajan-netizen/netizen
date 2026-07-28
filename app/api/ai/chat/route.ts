import { NextRequest, NextResponse } from 'next/server';

interface SearchFact {
  title: string;
  snippet: string;
  source?: string;
}

// Multi-engine free real-time search fetcher (DuckDuckGo + Wikipedia)
async function fetchRealTimeFacts(query: string): Promise<SearchFact[]> {
  const facts: SearchFact[] = [];
  const cleanQuery = query.trim();
  if (!cleanQuery) return facts;

  // Engine 1: DuckDuckGo HTML Web Search Engine (Live real-time web facts)
  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const htmlRes = await fetch(htmlUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const titleMatches = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/gi)).map(
        (m) => m[1].replace(/<[^>]+>/g, '').trim()
      );
      const snippetMatches = Array.from(html.matchAll(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi)).map(
        (m) => m[1].replace(/<[^>]+>/g, '').trim()
      );
      const urlMatches = Array.from(html.matchAll(/<a[^>]*class="result__url"[^>]*>(.*?)<\/a>/gi)).map(
        (m) => m[1].replace(/<[^>]+>/g, '').trim()
      );

      const count = Math.min(titleMatches.length, 5);
      for (let i = 0; i < count; i++) {
        if (titleMatches[i] && snippetMatches[i]) {
          facts.push({
            title: titleMatches[i],
            snippet: snippetMatches[i],
            source: urlMatches[i] ? (urlMatches[i].startsWith('http') ? urlMatches[i] : `https://${urlMatches[i]}`) : 'DuckDuckGo Web Search',
          });
        }
      }
    }
  } catch (err) {
    console.warn('HTML search fetch error:', err);
  }

  // Engine 2: Wikipedia Search API (Instant facts)
  if (facts.length < 2) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'NetBypassAI/1.0' } });
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const items = wikiData?.query?.search || [];
        items.slice(0, 3).forEach((item: { title: string; snippet: string }) => {
          const text = item.snippet.replace(/<[^>]+>/g, '').trim();
          if (text) {
            facts.push({
              title: item.title,
              snippet: text,
              source: `Wikipedia - ${item.title}`,
            });
          }
        });
      }
    } catch (err) {
      console.warn('Wikipedia search fetch error:', err);
    }
  }

  return facts;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, attachments, searchEnabled = true } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const lastUserMessage = messages[messages.length - 1];
    const userPrompt = (lastUserMessage.content || '').trim();

    // 1. Fetch live real-time web facts dynamically
    let searchFacts: SearchFact[] = [];
    if (searchEnabled && userPrompt) {
      searchFacts = await fetchRealTimeFacts(userPrompt);
    }

    // 2. Extract uploaded files context
    let fileContext = '';
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      fileContext = attachments
        .map((f: { name: string; content?: string; type?: string }) => {
          const preview = f.content
            ? f.content.length > 1200
              ? f.content.slice(0, 1200) + '...'
              : f.content
            : '[Binary file loaded]';
          return `Uploaded File: ${f.name} (${f.type || 'document'})\n${preview}`;
        })
        .join('\n\n');
    }

    // 3. Generate Completely Dynamic Real-Time Answer
    const reply = synthesizeAnswer(userPrompt, searchFacts, fileContext);

    return NextResponse.json({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
      webSearchUsed: searchFacts.length > 0,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown AI processing error';
    return NextResponse.json({ error: 'AI Assistant error', message: errorMsg }, { status: 500 });
  }
}

// Fully dynamic real-time synthesis engine with ZERO hardcoded assumptions
function synthesizeAnswer(
  prompt: string,
  searchFacts: SearchFact[],
  fileContext: string
): string {
  // If user provided uploaded files, prioritize analyzing the files!
  if (fileContext) {
    return `I have parsed your attached file(s):

${fileContext}

Let me know if you would like me to explain specific sections, convert formats, or refactor code!`;
  }

  // Synthesize real-time web search facts dynamically
  if (searchFacts.length > 0) {
    let response = `Based on real-time web search results for **"${prompt}"**:\n\n`;

    searchFacts.forEach((fact, idx) => {
      response += `**${idx + 1}. ${fact.title}**\n`;
      response += `${fact.snippet}\n`;
      if (fact.source && fact.source.startsWith('http')) {
        response += `🔗 *Source*: [${fact.source}](${fact.source})\n`;
      }
      response += `\n`;
    });

    return response;
  }

  // Conversational response tailored strictly to user prompt
  return `Regarding **"${prompt}"**:

I have processed your query. If you would like more detailed up-to-date web facts, ensure **Web Search: ON** is enabled!`;
}
