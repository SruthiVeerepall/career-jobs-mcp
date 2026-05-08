import json
import re
import sys

FILE1 = r"C:\Users\sruth\.claude\projects\c--Users-sruth-Desktop-Angular-Practice-career-jobs-mcp\6cffc7e9-5bb7-4daf-9abe-d21d40d7ad45\tool-results\mcp-claude_ai_Dice-search_jobs-1778152197068.txt"
FILE2 = r"c:\Users\sruth\Desktop\Angular Practice\career-jobs-mcp\dice-fullstack.json"

# Keywords with weights. Order matters for longest-match-first when patterns overlap.
KEYWORDS = [
    ("spring boot", 5),
    ("spring mvc", 3),
    ("spring security", 2),
    ("spring cloud", 2),
    ("spring batch", 2),
    ("hibernate", 3),
    ("jpa", 2),
    ("microservices", 4),
    ("rest api", 2),
    ("kafka", 3),
    ("aws", 3),
    ("lambda", 2),
    ("dynamodb", 2),
    ("ec2", 1),
    ("s3", 1),
    ("rds", 1),
    ("eks", 1),
    ("sqs", 1),
    ("azure", 2),
    ("aks", 1),
    ("paas", 1),
    ("docker", 2),
    ("kubernetes", 3),
    ("terraform", 1),
    ("maven", 1),
    ("gradle", 1),
    ("jenkins", 1),
    ("github actions", 2),
    ("angular", 4),
    ("react", 3),
    ("node.js", 2),
    ("javascript", 1),
    ("typescript", 1),
    ("html5", 1),
    ("css3", 1),
    ("postgres", 2),
    ("mysql", 1),
    ("mongodb", 1),
    ("oracle", 1),
    ("db2", 1),
    ("sql server", 1),
    ("splunk", 1),
    ("honeycomb", 1),
    ("prometheus", 1),
    ("sonarqube", 2),
    ("junit", 2),
    ("mockito", 1),
    ("playwright", 2),
    ("selenium", 1),
    ("agile", 1),
    ("tdd", 1),
    ("oauth", 1),
    ("jwt", 1),
    ("ssoit", 1),
    ("soap", 1),
    ("graphql", 1),
    ("intellij", 1),
    ("eclipse", 1),
    ("git", 1),
    ("jira", 1),
    ("java", 10),
]

# Reject patterns (case-insensitive)
REJECT_PATTERNS = [
    r"\bU\.?S\.?\s*citizen(?:s|ship)?\b",
    r"\bUSC(?:\s*only|\s*\/|\s*EAD)",
    r"\bgreen\s*card\s*holder\s*only\b",
    r"\bGC\s*(?:only|holder)\b",
    r"\bsecurity\s+clearance\b",
    r"\bactive\s+(?:secret|top\s*secret|ts\/sci|public\s*trust)",
    r"\bTS\/SCI\b",
    r"\b(?:secret|public\s*trust)\s+clearance\s+required\b",
    r"\bable\s+to\s+obtain\s+(?:a\s+)?(?:security|secret|public\s*trust)\s+clearance\b",
    r"\bclearance\s+required\b",
    r"\bITAR\b",
    r"\bNo\s+(?:GCs|GC|Greencards)\b",
    r"\bUSC\/GC\s*only\b",
    r"\bonly\s+US\s+citizens?\b",
]
REJECT_RE = [re.compile(p, re.IGNORECASE) for p in REJECT_PATTERNS]

# US state names + abbrevs + a few major cities
US_STATES = {
    "alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida",
    "georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine",
    "maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska",
    "nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota",
    "ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee",
    "texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming",
    "district of columbia",
}
US_ABBREVS = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
}
US_CITIES = {
    "new york","los angeles","chicago","houston","phoenix","philadelphia","san antonio","san diego",
    "dallas","san jose","austin","jacksonville","fort worth","columbus","charlotte","san francisco",
    "indianapolis","seattle","denver","washington","boston","el paso","nashville","detroit","oklahoma city",
    "portland","las vegas","memphis","louisville","baltimore","milwaukee","albuquerque","tucson","fresno",
    "sacramento","kansas city","mesa","atlanta","omaha","colorado springs","raleigh","miami","long beach",
    "virginia beach","oakland","minneapolis","tulsa","arlington","tampa","new orleans","wichita",
    "cleveland","bakersfield","aurora","anaheim","honolulu","santa ana","riverside","corpus christi",
    "lexington","stockton","henderson","saint paul","st. paul","st louis","st. louis","cincinnati",
    "pittsburgh","greensboro","anchorage","plano","lincoln","orlando","irvine","newark","durham",
    "chula vista","toledo","fort wayne","st. petersburg","laredo","jersey city","chandler","madison",
    "lubbock","scottsdale","reno","buffalo","gilbert","glendale","north las vegas","winston-salem",
    "chesapeake","norfolk","fremont","garland","irving","hialeah","richmond","boise","spokane","baton rouge",
    "tacoma","san bernardino","modesto","fontana","des moines","moreno valley","santa clarita","fayetteville",
    "birmingham","oxnard","rochester","port st. lucie","grand rapids","huntsville","salt lake city",
    "frisco","yonkers","amarillo","glendale","huntington beach","mckinney","montgomery","augusta","aurora",
    "akron","little rock","tempe","columbus","overland park","grand prairie","tallahassee","cape coral",
    "mobile","knoxville","shreveport","worcester","ontario","vancouver","sioux falls","chattanooga",
    "brownsville","fort lauderdale","providence","newport news","rancho cucamonga","santa rosa",
    "peoria","oceanside","elk grove","salem","pembroke pines","eugene","garden grove","cary","fort collins",
    "corona","springfield","jackson","alexandria","hayward","clarksville","lakewood","lancaster","salinas",
    "palmdale","hollywood","springfield","macon","kansas city","sunnyvale","pomona","killeen","escondido",
    "pasadena","naperville","bellevue","joliet","murfreesboro","midland","rockford","paterson","savannah",
    "bridgeport","torrance","mcallen","syracuse","surprise","denton","roseville","thornton","miramar",
    "pasadena","mesquite","olathe","dayton","carrollton","waco","orange","fullerton","charleston",
    "west valley city","visalia","hampton","gainesville","warren","coral springs","cedar rapids",
    "round rock","sterling heights","kent","columbia","santa clara","new haven","stamford","concord",
    "elizabeth","athens","thousand oaks","lafayette","simi valley","topeka","norman","fargo","wilmington",
    "abilene","odessa","columbia","pearland","victorville","hartford","vallejo","allentown","berkeley",
    "richardson","arvada","ann arbor","rochester","cambridge","sugar land","lansing","evansville",
    "college station","fairfield","clearwater","beaumont","independence","provo","west jordan","murrieta",
    "palm bay","el monte","carlsbad","north charleston","temecula","clovis","springfield","meridian",
    "westminster","costa mesa","high point","manchester","pueblo","lakeland","pompano beach","west palm beach",
    "antioch","everett","downey","lowell","centennial","elgin","richmond","peoria","broken arrow",
    "miami gardens","billings","jurupa valley","sandy springs","gresham","lewisville","hillsboro",
    "ventura","greeley","inglewood","waco","burbank","norwalk","frisco","rialto","las cruces","hialeah",
    "malvern","plymouth","reston","mclean","arlington","redmond","cary","columbus","beaverton","raleigh",
    "iselin","edison","piscataway","princeton","secaucus","jersey city","weehawken","hoboken","trenton",
    "morristown","parsippany","basking ridge","bridgewater","franklin lakes","whippany","summit",
    "bentonville","rogers","fayetteville","richardson","plano","irving","dallas","frisco","mckinney",
    "the woodlands","sugar land","spring","houston","austin","san antonio","el segundo","santa monica",
    "culver city","mountain view","palo alto","sunnyvale","cupertino","san mateo","redwood city",
    "menlo park","foster city","emeryville","alameda","walnut creek","pleasanton","fremont","san leandro",
    "burlingame","milpitas","san ramon","dublin","danville","livermore","tracy","stockton","modesto",
    "bellevue","redmond","kirkland","tacoma","spokane","bend","portland","beaverton","hillsboro",
    "tigard","tualatin","eugene","salem","corvallis",
}


def text_for_match(job):
    return ((job.get("title") or "") + " " + (job.get("summary") or "")).lower()


def has_java(text):
    # java word boundary, but exclude javascript-only mentions.
    # Strategy: count java occurrences excluding javascript. If >0, return True.
    # Replace 'javascript' first so it isn't counted.
    cleaned = re.sub(r"javascript", " ", text, flags=re.IGNORECASE)
    return re.search(r"\bjava\b", cleaned, re.IGNORECASE) is not None


def is_rejected(text):
    for r in REJECT_RE:
        if r.search(text):
            return True
    return False


def is_us_location(job, default_us=True):
    loc = job.get("jobLocation") or {}
    name = (loc.get("displayName") or "").strip()
    if not name:
        return default_us
    n_lower = name.lower()
    if n_lower.endswith("usa") or "united states" in n_lower:
        return True
    # check US states (substring)
    for s in US_STATES:
        if s in n_lower:
            return True
    # check abbrev in any token
    tokens = re.split(r"[,\s]+", name)
    for t in tokens:
        if t.strip().rstrip(".") in US_ABBREVS:
            return True
    for c in US_CITIES:
        if c in n_lower:
            return True
    return False


def score_job(text):
    score = 0
    matched = []
    for kw, w in KEYWORDS:
        # build word-boundary pattern; escape, but allow . and + with literal
        if "." in kw or "#" in kw or "+" in kw:
            # patterns with dots like node.js / html5 — use lookaround
            pat = r"(?<![A-Za-z0-9])" + re.escape(kw) + r"(?![A-Za-z0-9])"
        else:
            pat = r"\b" + re.escape(kw) + r"\b"
        if re.search(pat, text, re.IGNORECASE):
            score += w
            matched.append(kw)
    return score, matched


def extract_years(text):
    # find first integer before "years" or "yrs"
    m = re.search(r"(\d{1,2})\+?\s*(?:years|yrs|year|yr)\b", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fmt_posted(s):
    # ISO-like, return hh:mmZ portion
    if not s:
        return ""
    m = re.match(r"\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):\d{2}Z", s)
    if m:
        return f"{m.group(1)}:{m.group(2)}Z"
    # also handle date-only form
    return s[-9:] if len(s) > 9 else s


def md_escape(s):
    if not s:
        return ""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def main():
    f1 = load(FILE1)
    f2 = load(FILE2)
    raw = (f1.get("data") or []) + (f2.get("data") or [])
    total_loaded = len(raw)

    # dedupe by guid
    seen = set()
    deduped = []
    for j in raw:
        g = j.get("guid")
        if not g:
            continue
        if g in seen:
            continue
        seen.add(g)
        deduped.append(j)

    # java filter
    after_java = []
    for j in deduped:
        t = text_for_match(j)
        if has_java(t):
            after_java.append(j)

    # reject filter + location
    after_reject = []
    for j in after_java:
        t = text_for_match(j)
        if is_rejected(t):
            continue
        if not is_us_location(j, default_us=True):
            continue
        after_reject.append(j)

    # score
    scored = []
    for j in after_reject:
        t = text_for_match(j)
        s, matched = score_job(t)
        yrs = extract_years(t)
        scored.append((j, s, yrs, matched))

    # sort: score desc, then years asc (None last)
    def sort_key(item):
        j, s, y, _ = item
        return (-s, (y if y is not None else 999))

    scored.sort(key=sort_key)
    top = scored[:50]

    print(f"TOTAL_LOADED={total_loaded}")
    print(f"AFTER_DEDUPE={len(deduped)}")
    print(f"AFTER_JAVA={len(after_java)}")
    print(f"AFTER_REJECT={len(after_reject)}")
    print(f"FINAL={len(top)}")
    print("---")

    for i, (j, s, y, matched) in enumerate(top, 1):
        title = md_escape(j.get("title"))
        company = md_escape(j.get("companyName"))
        loc = md_escape(((j.get("jobLocation") or {}).get("displayName")) or "")
        posted = fmt_posted(j.get("postedDate"))
        url = j.get("detailsPageUrl") or ""
        yrs_str = str(y) if y is not None else "-"
        print(f"| {i} | {title} | {company} | {loc} | {posted} | {yrs_str} | {s} | [link]({url}) |")

    # also print top 3 with matched keywords for the why-section
    print("---WHY---")
    for j, s, y, matched in top[:8]:
        print(f"{md_escape(j.get('title'))} @ {md_escape(j.get('companyName'))} :: score={s} :: kw={matched}")


if __name__ == "__main__":
    main()
