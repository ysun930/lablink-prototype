def calculate_match_score(matching_items):
    total_score = 0
    max_score = 0

    for item in matching_items:
        weight = item["weight"]
        match = item["match"]

        total_score += weight * match
        max_score += weight

    match_percentage = (total_score / max_score) * 100

    return round(match_percentage, 1)


def match_label(score):
    if score >= 80:
        return "Strong Match"
    elif score >= 60:
        return "Good Match"
    elif score >= 40:
        return "Partial Match"
    else:
        return "Poor Match"


cand001_lab001 = [
    {"item": "Neuroscience field", "match": 1, "weight": 3},
    {"item": "Sub-discipline match", "match": 1, "weight": 2},
    {"item": "PCR", "match": 1, "weight": 3},
    {"item": "Western Blot", "match": 1, "weight": 3},
    {"item": "Mammalian Cell Culture", "match": 1, "weight": 3},
    {"item": "Confocal Microscopy", "match": 1, "weight": 3},
    {"item": "Academic PhD / basic science alignment", "match": 1, "weight": 3},
    {"item": "Junior level", "match": 1, "weight": 3},
    {"item": "Part-time / 10–20 hours", "match": 1, "weight": 3},
    {"item": "Academic credit / for-credit", "match": 1, "weight": 2},
    {"item": "In-person only", "match": 1, "weight": 3},
    {"item": "Immunofluorescence", "match": 0, "weight": 3},
    {"item": "Flow Cytometry", "match": 0, "weight": 3},
    {"item": "CRISPR-Cas9", "match": 0, "weight": 3},
]


score = calculate_match_score(cand001_lab001)
label = match_label(score)

print("CAND-001 vs LAB-001")
print("Match Percentage:", score, "%")
print("Match Label:", label)
