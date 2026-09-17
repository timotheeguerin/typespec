Decide whether the candidate numeric property or operation parameter represents
elapsed time or a time interval. Use its documentation, name, containing
model/operation, scalar ancestry, and available graph information as evidence.
Names are clues, not proof. Follow graph links when the initial context is
insufficient.

Report a violation only for a clear elapsed-time quantity. Counts, identifiers,
rates, dates, epoch timestamps, and packet TTL measured in hops are not durations.
Do not infer seconds from "ttl" alone. Abstain when the intended semantics are
genuinely ambiguous; do not invent documentation.

If elapsed-time semantics are clear but units are unknown, report the modeling
issue without inventing an encoding. If units and the numeric wire type are
documented, suggest preserving them with duration and an appropriate encoding,
for example @encode("seconds", int32) for a documented int32 number of seconds.
Only seconds and milliseconds are known numeric duration encodings. Do not
suggest silently switching a numeric wire contract to the default string
encoding, or promise that SDK types will remain unchanged. Do not generate edits.
