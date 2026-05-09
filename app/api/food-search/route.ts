import { NextResponse } from 'next/server';

// Local Fallback Database
const LOCAL_FALLBACK = [
    { name: "Fried Egg", brand: "Generic", kcal: 196, protein: 13, carbs: 1, fat: 15, id: "local-1", source: "Local" },
    { name: "Boiled Egg", brand: "Generic", kcal: 155, protein: 13, carbs: 1, fat: 11, id: "local-2", source: "Local" },
    { name: "Chicken Breast", brand: "Generic", kcal: 165, protein: 31, carbs: 0, fat: 4, id: "local-6", source: "Local" },
    { name: "Avocado", brand: "Generic", kcal: 160, protein: 2, carbs: 9, fat: 15, id: "local-7", source: "Local" },
    { name: "Banana", brand: "Generic", kcal: 89, protein: 1, carbs: 23, fat: 0.3, id: "local-8", source: "Local" }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').toLowerCase();
  const results: any[] = [];

  if (!query || query.length < 2) return NextResponse.json({ products: [] });

  // 1. Local Fallback
  const localMatches = LOCAL_FALLBACK.filter(f => f.name.toLowerCase().includes(query));
  results.push(...localMatches);

  // 2. OpenFoodFacts (Global)
  try {
    const offRes = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`, {
        headers: { 'User-Agent': 'HealthFlow - PersonalDashboard - 1.0' }
    });
    if (offRes.ok) {
        const data = await offRes.json();
        data.products?.forEach((p: any) => {
            results.push({
                name: p.product_name || "Unknown Product",
                brand: p.brands || "Global",
                kcal: Math.round(parseFloat(p.nutriments?.['energy-kcal_100g'] || 0)),
                protein: parseFloat(p.nutriments?.['proteins_100g'] || 0),
                carbs: parseFloat(p.nutriments?.['carbohydrates_100g'] || 0),
                fat: parseFloat(p.nutriments?.['fat_100g'] || 0),
                id: `off-${p.id}`,
                source: 'OFF'
            });
        });
    }
  } catch (e) { console.error('OFF Failed'); }

  // 3. USDA (Raw/Whole)
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
                    kcal: Math.round(nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('energy') && n.unitName.toLowerCase() === 'kcal')?.value || 0),
                    protein: nutrients.find((n: any) => n.nutrientName.toLowerCase() === 'protein')?.value || 0,
                    carbs: nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('carbohydrate'))?.value || 0,
                    fat: nutrients.find((n: any) => n.nutrientName.toLowerCase().includes('total lipid'))?.value || 0,
                    id: `usda-${food.fdcId}`,
                    source: 'USDA'
                });
            });
        }
    } catch (e) { console.error('USDA Failed'); }
  }

  // 4. FatSecret (Branded/Restaurants)
  const fsId = process.env.FATSECRET_CLIENT_ID;
  const fsSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (fsId && fsSecret) {
    try {
        const auth = btoa(`${fsId}:${fsSecret}`);
        const tokenRes = await fetch('https://oauth.fatsecret.com/connect/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials&scope=basic'
        });
        const tokenData = await tokenRes.json();
        const token = tokenData.access_token;
        if (token) {
            const fsRes = await fetch(`https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (fsRes.ok) {
                const data = await fsRes.json();
                const foods = data.foods?.food;
                if (foods) {
                    const foodArray = Array.isArray(foods) ? foods : [foods];
                    foodArray.forEach((f: any) => {
                        const desc = f.food_description || "";
                        const kcal = desc.match(/Calories:\s*(\d+)/i)?.[1] || 0;
                        const protein = desc.match(/Protein:\s*([\d.]+)/i)?.[1] || 0;
                        const carbs = desc.match(/Carbs:\s*([\d.]+)/i)?.[1] || 0;
                        const fat = desc.match(/Fat:\s*([\d.]+)/i)?.[1] || 0;
                        results.push({
                            name: f.food_name,
                            brand: f.brand_name || "Branded",
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
    } catch (e) { console.error('FatSecret Failed'); }
  }

  const finalProducts = results
    .filter(p => p.kcal > 0)
    .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
    .slice(0, 15);

  return NextResponse.json({ products: finalProducts });
}
