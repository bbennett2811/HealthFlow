import { NextResponse } from 'next/server';

// Local Fallback Database
const LOCAL_FALLBACK = [
    { name: "Fried Egg", brand: "Generic", kcal: 196, protein: 13, carbs: 1, fat: 15, id: "local-1" },
    { name: "Boiled Egg", brand: "Generic", kcal: 155, protein: 13, carbs: 1, fat: 11, id: "local-2" },
    { name: "Scrambled Egg", brand: "Generic", kcal: 148, protein: 10, carbs: 2, fat: 11, id: "local-3" },
    { name: "White Bread", brand: "Generic", kcal: 265, protein: 9, carbs: 49, fat: 3, id: "local-4" },
    { name: "Brown Rice", brand: "Generic", kcal: 111, protein: 3, carbs: 23, fat: 1, id: "local-5" },
    { name: "Chicken Breast", brand: "Generic", kcal: 165, protein: 31, carbs: 0, fat: 4, id: "local-6" },
    { name: "Avocado", brand: "Generic", kcal: 160, protein: 2, carbs: 9, fat: 15, id: "local-7" },
    { name: "Banana", brand: "Generic", kcal: 89, protein: 1, carbs: 23, fat: 0.3, id: "local-8" },
    { name: "Nutella", brand: "Ferrero", kcal: 539, protein: 6, carbs: 57, fat: 31, id: "local-9" }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').toLowerCase();
  const results: any[] = [];

  if (!query || query.length < 2) return NextResponse.json({ products: [] });

  console.log(`Starting search for: ${query}`);

  // 1. Local Fallback
  const localMatches = LOCAL_FALLBACK.filter(f => f.name.toLowerCase().includes(query));
  results.push(...localMatches);

  // 2. OpenFoodFacts (Keyless & Always On)
  try {
    const offRes = await fetch(`https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`, {
        headers: { 'User-Agent': 'HealthFlow - MacroSearch - 1.0' }
    });
    if (offRes.ok) {
        const data = await offRes.json();
        data.products?.forEach((p: any) => {
            results.push({
                name: p.product_name || "Unknown",
                brand: p.brands || "OFF",
                kcal: p.nutriments?.['energy-kcal_100g'] || 0,
                protein: p.nutriments?.['proteins_100g'] || 0,
                carbs: p.nutriments?.['carbohydrates_100g'] || 0,
                fat: p.nutriments?.['fat_100g'] || 0,
                id: `off-${p.id}`,
                source: 'OFF'
            });
        });
    }
  } catch (e) { console.error('OFF Search Failed'); }

  // 3. USDA (Requires Key)
  const usdaKey = process.env.USDA_API_KEY;
  if (usdaKey) {
    try {
        const usdaRes = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey}&query=${encodeURIComponent(query)}&pageSize=5`);
        if (usdaRes.ok) {
            const data = await usdaRes.json();
            data.foods?.forEach((food: any) => {
                const nutrients = food.foodNutrients;
                results.push({
                    name: food.description,
                    brand: food.brandOwner || "USDA",
                    kcal: nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('energy') && n.unitName.toLowerCase() === 'kcal')?.value || 0,
                    protein: nutrients.find((n: any) => n.nutrientName.toLowerCase() === 'protein')?.value || 0,
                    carbs: nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('carbohydrate'))?.value || 0,
                    fat: nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('total lipid'))?.value || 0,
                    id: `usda-${food.fdcId}`,
                    source: 'USDA'
                });
            });
        }
    } catch (e) { console.error('USDA Search Failed'); }
  }

  // 4. FatSecret (Requires Auth)
  const fsId = process.env.FATSECRET_CLIENT_ID;
  const fsSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (fsId && fsSecret) {
    try {
        const tokenRes = await fetch('https://oauth.fatsecret.com/connect/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(fsId + ':' + fsSecret).toString('base64')
            },
            body: 'grant_type=client_credentials&scope=basic'
        });
        const tokenData = await tokenRes.json();
        const token = tokenData.access_token;
        if (token) {
            const fsRes = await fetch(`https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
                if (fsRes.ok) {
                    const data = await fsRes.json();
                    const foods = data.foods?.food;
                    if (foods) {
                        const foodArray = Array.isArray(foods) ? foods : [foods];
                        foodArray.forEach((f: any) => {
                            const desc = f.food_description || "";
                            // Improved Regex: Case-insensitive and handles decimals/spaces
                            const kcal = desc.match(/Calories:\s*(\d+)/i)?.[1] || 0;
                            const protein = desc.match(/Protein:\s*([\d.]+)/i)?.[1] || 0;
                            const carbs = desc.match(/Carbs:\s*([\d.]+)/i)?.[1] || 0;
                            const fat = desc.match(/Fat:\s*([\d.]+)/i)?.[1] || 0;
                            
                            results.push({
                                name: f.food_name,
                                brand: f.brand_name || "Generic",
                                kcal: parseInt(kcal as string),
                                protein: parseFloat(protein as string),
                                carbs: parseFloat(carbs as string),
                                fat: parseFloat(fat as string),
                                id: `fs-${f.food_id}`,
                                source: 'FS'
                            });
                        });
                    }
                }
        }
    } catch (e) { console.error('FatSecret Search Failed'); }
  }

  // Deduplicate and filter
  const finalProducts = results
    .filter(p => p.kcal > 0)
    .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
    .slice(0, 15);

  console.log(`Final results count: ${finalProducts.length}`);
  return NextResponse.json({ products: finalProducts });
}
