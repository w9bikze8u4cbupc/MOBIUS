import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Fetches the raw HTML of a BGG game page and extracts main visible text content.
 * @param {string} url - The full URL of the BGG game page.
 * @returns {Promise<string>} - Extracted main text content.
 */
export async function fetchBGGPageText(url) {
  try {
    const { data: html } = await axios.get(url);

    // Load HTML into cheerio for parsing
    const $ = cheerio.load(html);

    // Extract main content text - adjust selectors if needed
    // Common BGG page main content container is '#mainbody'
    const mainContentText = $('#mainbody').text().trim();

    // Fallback: if empty, get body text
    if (!mainContentText) {
      return $('body').text().trim();
    }

    return mainContentText;
  } catch (error) {
    console.error('Error fetching BGG page:', error.message);
    throw new Error('Failed to fetch or parse BGG page');
  }
}