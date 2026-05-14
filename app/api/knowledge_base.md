# AgriOpenEye — Knowledge Base

This document is the knowledge base for the AgriOpenEye farmer chat assistant.
Use it to answer any question a farmer asks about the product, their land, the scores,
or the underlying data. Always answer in plain language. Never use technical jargon
without explaining it. If a farmer asks something outside this knowledge base, say so
honestly rather than guessing.

---

## What AgriOpenEye Is

AgriOpenEye is a tool that tells you how suitable a piece of land is for growing specific
crops, based on real satellite data. You pick a location on the map, pick a crop, and get
a score between 0 and 100%. The score tells you how closely that land's conditions match
what that crop needs to grow well. You also get a plain explanation of why the score is
what it is.

The tool currently covers four crops: vineyard, winter wheat, sunflower, and sorghum.
It works for two regions: Catalonia (Spain) and Bavaria (Germany).

It is designed to be used during the winter planning window, December through February,
when farmers are making decisions about what to plant next season or whether to invest
in a new plot.

---

## The Four Crops

### Vineyard
Vines are a long-term investment. Once planted, a vineyard takes several years to produce
its first harvest and is expected to stay in the ground for 20 to 30 years. The score for
vineyard tells you whether a plot's satellite-measured conditions match what healthy,
established vineyards look like in Catalonia. Key factors: moderate vegetation density in
July and August, mild water stress (vines actually prefer some dryness for quality), and
healthy canopy readings at the veraison stage (when grapes change color, late July to
early August).

### Winter Wheat
Wheat is planted in autumn and harvested in early summer. It needs sufficient moisture
during grain fill in spring (April to May) and a sharp green-up from winter dormancy.
The score for winter wheat tells you whether a plot's conditions match parcels where
wheat has historically established well. Key factors: high vegetation peak in April to May,
positive moisture readings in spring, and good canopy health during heading stage.

### Sunflower
Sunflower is a drought-tolerant crop, making it a strong rotation candidate as summers
get drier. It peaks later than wheat, in July and August. The score for sunflower tells you
whether a plot's summer conditions match what sunflower needs. Key factors: moderate to
high vegetation peak in summer, tolerance for dry conditions (low water index is acceptable),
and heat accumulation through the growing season.

### Sorghum
Sorghum is one of the most drought-resistant crops available for European farmers. It peaks
in August and September, later than sunflower. It is particularly relevant for farmers in
Bavaria and southern Germany who are seeing corn yields decline as summers get hotter
and drier. The score for sorghum tells you whether a plot's late-summer conditions match
sorghum's known requirements. Note: sorghum has less European-specific data behind it
than the other three crops, so its scores carry slightly more uncertainty.

---

## What the Suitability Score Means

The score is a number between 0 and 100%.

- **Above 70%** — Good match. The land's conditions closely resemble what this crop needs.
- **50 to 70%** — Moderate match. Some conditions are right, some are not. Read the feature
  breakdown to understand what is working and what is not.
- **Below 50%** — Weak match. The land's conditions do not closely resemble what this crop
  needs under current satellite-measured conditions.
- **Low confidence** — The model is not certain enough to give a recommendation. This happens
  when no single crop scores clearly above the others, or when the top score is below 55%.
  This can happen on non-agricultural land (forests, roads, water) or on land with unusual
  satellite signatures.

**Important:** the score is not a yield guarantee. It tells you whether conditions look
right, not whether your harvest will be good. Weather, pests, soil chemistry, and farming
practice all affect yield in ways the satellite cannot see. Think of it as a starting point
for your decision, not the final word.

---

## The Eight Features Explained

For each crop, the score is built from eight measurements. When you click a point on the
map, you see all eight with your observed value and the reference range for that crop.

### 1. NDVI Peak Value
NDVI stands for Normalised Difference Vegetation Index. It measures how green and healthy
the vegetation is, on a scale from -1 to 1. Values above 0.3 indicate active vegetation.
Values above 0.6 indicate dense, healthy crops. The peak value is the highest NDVI reading
recorded during that crop's main growing window. For vineyard, the ideal peak is between
0.35 and 0.55 — not too high, because very high NDVI on a vineyard often means grass
growing between the rows, not healthy vines.

### 2. NDVI Peak Timing
This is the month when the NDVI value was highest across the whole year. Crops have
predictable seasonal patterns. Wheat peaks in April or May. Vineyards and sunflowers peak
in July or August. Sorghum peaks in August or September. If a plot's peak timing matches
the expected month for a crop, that is a positive signal. If it peaks much earlier or later,
the land may be under a different type of vegetation or experiencing unusual growing conditions.

### 3. NDVI Green-Up Rate
This measures how quickly the vegetation greened up from winter dormancy (February) to
its peak. A steep, fast green-up is typical of annual crops like wheat that grow quickly
in spring. A slower, steadier green-up is more typical of perennial crops like vineyards.
A negative green-up rate means vegetation actually declined from February to the peak month,
which is unusual and may indicate a data quality issue or non-agricultural land use.

### 4. NDVI Senescence Rate
This measures how quickly the vegetation declined after its peak, from the peak month
through to November. Annual crops like wheat senesce (dry out and die) very quickly after
harvest, giving a steep negative rate. Perennial crops like vineyards decline more slowly
as leaves gradually turn and drop. A senescence rate close to zero means the vegetation
stayed green throughout the season, which can indicate irrigated land, forests, or grass.

### 5. NDWI at Peak (Water Index)
NDWI stands for Normalised Difference Water Index. It measures how much water is present
in the vegetation and soil, on a scale from -1 to 1. Positive values indicate more moisture.
Negative values indicate drier conditions. Each crop has a different ideal moisture level
during its peak growing window. Wheat needs positive NDWI in spring (0.05 to 0.25). Vines
actually perform better with mild water stress (-0.15 to 0.05). Sunflower and sorghum
tolerate quite dry conditions (-0.25 to 0.00 for sunflower, -0.20 to 0.05 for sorghum).

### 6. NDRE at Peak (Canopy Health)
NDRE stands for Normalised Difference Red Edge. It measures the health of the plant
canopy using a wavelength of light that is sensitive to chlorophyll content. It is less
affected by grass growing between crop rows than NDVI, making it particularly useful for
vineyards. Higher NDRE values indicate healthier, more chlorophyll-rich canopy. The ideal
range is 0.15 to 0.35 for vineyard, 0.20 to 0.40 for winter wheat, 0.15 to 0.30 for
sunflower, and 0.15 to 0.35 for sorghum.

### 7. Off-Season NDVI
This is the average NDVI during December, January, and February — before any crop is
planted. It gives a picture of the land's baseline conditions: soil type, organic matter,
drainage. Low off-season NDVI (below 0.2) indicates bare soil or dormant perennials, which
is typical of well-managed agricultural land. High off-season NDVI can indicate dense
cover crops, woodland, or poorly drained land that retains green vegetation year-round.

### 8. Literature Distance
This is a single number that summarises how far the plot's observed conditions (NDVI peak,
water index, canopy health) are from the ideal conditions described in published scientific
papers for that crop. A literature distance close to zero means the conditions are very close
to the published ideal. A high literature distance means conditions are far from the ideal,
which pulls the suitability score down. This feature directly encodes four peer-reviewed
papers into the score: Anastasiou et al. (2021) for vineyard, Dimitrov et al. (2020) for
winter wheat, Marino (2023) for sunflower, and Habyarimana and Baloch (2021) for sorghum.

---

## Where the Data Comes From

### Sentinel-2 Satellite (ESA Copernicus)
The satellite readings used to score your land come from the Sentinel-2 satellite, operated
by the European Space Agency. It photographs every piece of land in Europe every 5 days
and the data is free to access. The readings used in AgriOpenEye are from 2023, covering
the full year from January to December. The satellite measures light reflected from the
ground across multiple wavelengths, which we combine into the indices described above.

### Sen4AgriNet Training Dataset
The model learned what each crop looks like by studying 65,000 real farm fields in Catalonia
from 2019. These fields were matched to legal crop declarations that Spanish farmers submitted
to the government as part of the EU Common Agricultural Policy. This means the labels are
real: each field was confirmed to be growing the declared crop by the farmer themselves.
The dataset was published by researchers at the National Observatory of Athens (Sykas et al.
2022) and is freely available for research use.

### Scientific Reference Profiles
Four published papers define the ideal index ranges for each crop. These were used to
engineer the features and to anchor the model to agronomic knowledge:
- **Vineyard:** Anastasiou et al. (2021), MDPI Agriculture
- **Winter Wheat:** Dimitrov et al. (2020), Taylor and Francis
- **Sunflower:** Marino (2023), Heliyon
- **Sorghum:** Habyarimana and Baloch (2021), Arabian Journal of Geosciences

---

## How the Model Works (simple version)

The model studied 65,000 Catalan farm fields where it knew exactly what crop was growing
and what the satellite readings looked like for that crop. It learned patterns: fields that
were good for vineyard tended to have these kinds of readings. Fields that were good for
wheat tended to have those kinds of readings.

When you point the tool at a new piece of land, it takes that land's satellite readings,
computes the eight features, and asks: which crop does this most closely resemble? It gives
each crop a probability score. The highest score wins, as long as it is confident enough.

The model does not know your soil chemistry, your water access, your microclimate, or
your local pest pressure. It sees only what the satellite can measure. Use the score as
one input into your decision, alongside your own knowledge of the land.

---

## Known Limitations

### The score reflects conditions, not yield
The satellite sees vegetation patterns. It cannot see soil pH, nutrient levels, drainage
problems underground, or disease pressure. A high suitability score means the land looks
right from above. It does not guarantee a good harvest.

### The training data is from 2019
The model learned from 2019 Catalan farm fields. The satellite data it scores is from 2023.
Four years of climate variation means conditions can shift. The model's reference patterns
are slightly dated, but the underlying phenological patterns (when crops grow, peak, and
senesce) are stable enough for the scores to be meaningful.

### Bavaria has less training data
The model was trained on Catalonia only. Bavaria has a Continental climate (colder winters,
shorter growing season) while Catalonia is Mediterranean. This means the model is applying
patterns learned in one climate to a different climate. The scores for Bavaria are
directionally useful but carry more uncertainty than the Catalonia scores.

### Grid points, not your exact field
The current version scores a regular grid of points spaced roughly 5 kilometres apart.
Your specific field may not have a grid point exactly on it. The nearest point gives a
reasonable approximation but is not a parcel-level analysis of your exact land. Future
versions will use official land registry boundaries for precise field-level scoring.

### Sorghum scores carry more uncertainty
Sorghum is less commonly grown in Europe, so the reference profile comes mainly from
research conducted outside Europe. The sorghum scores are still useful as a directional
signal, but treat them with slightly more caution than the vineyard and wheat scores.

---

## Frequently Asked Questions

**Why is my land showing as uncertain?**
Uncertain means no single crop scored clearly enough above the others to give a confident
recommendation. This can happen when the land is not agricultural (forests, roads, reservoirs
all appear on the grid), when the satellite readings for that point are noisy due to cloud
cover, or when the land genuinely has conditions that sit between crop types. It is not
an error — it is the model being honest about what it does not know.

**My vineyard has been here for 30 years. Why does it score 45%?**
The score compares conditions to what the satellite typically sees over well-performing
Catalan vineyard parcels. There are a few reasons an established vineyard might score
lower: grass between the rows raising the NDVI above the expected range for vines,
irrigation masking the mild water stress that characterises healthy dry-farmed vineyards,
or the specific micro-climate of your plot differing from the broader Catalan average.
The score is a comparison to a reference, not a judgment on your farming.

**Can I use this to decide whether to buy a new plot?**
Yes, this is exactly what the tool is designed for. For a long-term investment like planting
vines, checking how the land's satellite signature compares to known vineyard conditions
gives you a data point you did not have before. Combine it with a physical visit, a soil
test, and advice from your cooperative. The score reduces guessing — it does not replace
judgment.

**Why does sunflower score higher than vineyard on my land?**
The model compares your land's conditions to the reference profile for each crop. If your
summer readings show drier conditions and later peak timing, that matches sunflower better
than vineyard. This does not mean you should necessarily plant sunflower — it means the
current satellite signature of your land resembles sunflower conditions more closely than
vineyard conditions. If you have good reasons to plant vineyard (existing infrastructure,
market access, personal expertise), the score is one factor, not the only factor.

**How often is the data updated?**
The current version uses 2023 satellite data. Updates to more recent years are planned.
The model itself will be retrained as more recent labeled data becomes available.

**Does this tool work in other European countries?**
Currently it covers Catalonia and Bavaria only. The methodology works for any region
where Sentinel-2 data is available (which is all of Europe), but the model needs labeled
training data from each region to perform reliably. Expanding to other regions is on the
roadmap.

**Is my data shared with anyone?**
No. The tool scores publicly available satellite data. It does not collect or store any
information about you, your farm, or your queries.

**What is LPIS?**
LPIS stands for Land Parcel Identification System. It is the EU-wide database where farmers
register their fields and declare what crop they are growing each year, as a requirement
for receiving Common Agricultural Policy (CAP) subsidies. The Sen4AgriNet training dataset
used by AgriOpenEye is built from LPIS declarations, which is why the crop labels are
reliable — they come from legal farmer declarations, not guesses.

**Who built this?**
AgriOpenEye was built by a student team at ESADE Business School (Group 6) as part of
a Perspectives on AI course project. The tool is a research prototype demonstrating
the concept. It is not yet a commercial product.

---

## Chat Assistant Instructions

When a farmer asks a question:

1. Answer in plain, direct language. No technical terms without explanation.
2. If the question is about a specific score they are seeing, ask them which crop and
   which feature is confusing them so you can give a specific answer.
3. If the question is about whether to plant a specific crop, give them the relevant
   information from this knowledge base and remind them the score is one input, not
   the final answer.
4. If the question is outside the scope of this knowledge base (agronomic advice,
   weather forecasts, pricing, subsidies), say so clearly and suggest where they
   might find that information (cooperative, local agronomist, government agricultural
   agency).
5. Never invent data or scores. If you do not know, say so.
6. Keep answers short. Farmers are busy. Get to the point.
