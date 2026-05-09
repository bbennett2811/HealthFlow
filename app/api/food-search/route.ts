import { NextResponse } from 'next/server';

// Local Fallback Database for when APIs are rate-limited or keys are missing
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

  const NIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
  const NIX_APP_KEY = process.env.NUTRITIONIX_APP_KEY;

  if (!query || query.length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const results: any[] = [];

    // 1. Local Fallback / Fuzzy Typos
    const localMatches = LOCAL_FALLBACK.filter(f => 
        f.name.toLowerCase().includes(query) || 
        (query.includes('friend') && f.name.toLowerCase().includes('fried'))
    );
    results.push(...localMatches);

    // 2. Multi-Source Fetch (USDA, OFF)
    const fetchPromises: any[] = [
      fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY || 'DEMO_KEY'}&query=${encodeURIComponent(query)}&pageSize=5`),
      fetch(`https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`, {
        headers: { 'User-Agent': 'HealthFlow - MacroSearch - 1.0' }
      })
    ];

    const responses = await Promise.allSettled(fetchPromises);

    // Process USDA (Response index 0)
    if (responses[0].status === 'fulfilled' && responses[0].value.ok) {
        const data = await responses[0].value.json();
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
                source: 'US'
            });
        });
    }

    // Process OFF (Response index 1)
    if (responses[1].status === 'fulfilled' && responses[1].value.ok) {
        const data = await responses[1].value.json();
        data.products?.forEach((p: any) => {
            results.push({
                name: p.product_name || "Unknown",
                brand: p.brands || "UK Database",
                kcal: p.nutriments?.['energy-kcal_100g'] || 0,
                protein: p.nutriments?.['proteins_100g'] || 0,
                carbs: p.nutriments?.['carbohydrates_100g'] || 0,
                fat: p.nutriments?.['fat_100g'] || 0,
                id: `off-${p.id}`,
                source: 'UK'
            });
        });
    }

    // 3. FatSecret Search (The reliable free professional source)
    const FS_CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
    const FS_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;

    if (FS_CLIENT_ID && FS_CLIENT_SECRET) {
        try {
            console.log('Attempting FatSecret Auth...');
            const tokenRes = await fetch('https://oauth.fatsecret.com/connect/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(FS_CLIENT_ID + ':' + FS_CLIENT_SECRET).toString('base64')
                },
                body: 'grant_type=client_credentials&scope=basic'
            });
            
            const tokenData = await tokenRes.json();
            const token = tokenData.access_token;

            if (token) {
                console.log('FatSecret Auth Success!');
                const fsRes = await fetch(`https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (fsRes.ok) {
                    const data = await fsRes.json();
                    console.log(`FatSecret found ${data.foods?.food?.length || 0} items`);
                    data.foods?.food?.forEach((f: any) => {
                        const desc = f.food_description || "";
                        const kcal = desc.match(/Calories: (\d+)kcal/)?.[1] || 0;
                        const protein = desc.match(/Protein: ([\d.]+)g/)?.[1] || 0;
                        const carbs = desc.match(/Carbs: ([\d.]+)g/)?.[1] || 0;
                        const fat = desc.match(/Fat: ([\d.]+)g/)?.[1] || 0;

                        results.push({
                            name: f.food_name,
                            brand: f.brand_name || "Generic",
                            kcal: parseInt(kcal),
                            protein: parseFloat(protein),
                            carbs: parseFloat(carbs),
                            fat: parseFloat(fat),
                            id: `fs-${f.food_id}`,
                            source: 'FatSecret'
                        });
                    });
                }
            } else {
                console.error('FatSecret Auth Failed: No token returned');
            }
        } catch (err) { console.error('FatSecret Critical Error:', err); }
    } else {
        console.warn('FatSecret Keys Missing in Environment');
    }

    const finalProducts = results
        .filter(p => p.kcal > 0)
        .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
        .slice(0, 15);

    return NextResponse.json({ products: finalProducts });
  } catch (error) {
    console.error('Unified Food Search Error:', error);
    return NextResponse.json({ error: 'Failed to fetch food data' }, { status: 500 });
  }
}
