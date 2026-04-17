import "@typespec/http";
import "@typespec/rest";

using Http;
using Rest;

@service(#{title: "PetStore"})
namespace PetStore;

// ── Enums ──────────────────────────────────────────────────

/** Color options for a pet */
enum Color {
  Red,
  Blue,
  Green,
}

/** Pet size category */
enum Size {
  Small: "small",
  Medium: "medium",
  Large: "large",
}

// ── Models ─────────────────────────────────────────────────

/** Address model */
model Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/** Base model for all pets */
model Pet {
  @key id: int64;
  name: string;
  age: int32;
  color?: Color;
  size: Size;
  tags: string[];
  metadata?: Record<string>;
  address: Address;
  isActive: boolean;
  weight: float64;
  createdAt: utcDateTime;
}

/** A dog extends Pet */
model Dog extends Pet {
  breed: string;
  isGoodBoy: boolean;
}

/** Error response */
model Error {
  code: int32;
  message: string;
}

/** List result with pagination */
model PetListResult {
  items: Pet[];
  nextLink?: url;
}

// ── Operations ─────────────────────────────────────────────

@route("/pets")
interface Pets {
  /** List all pets */
  @get list(@query skip?: int32, @query top?: int32): PetListResult | Error;

  /** Get a pet by ID */
  @get read(@path id: int64): Pet | Error;

  /** Create a new pet */
  @post create(@body pet: Pet): Pet | Error;

  /** Update an existing pet */
  @put update(@path id: int64, @body pet: Pet): Pet | Error;

  /** Delete a pet */
  @delete delete(@path id: int64): void | Error;
}

@route("/dogs")
interface Dogs {
  /** List all dogs */
  @get list(@query skip?: int32, @query top?: int32): Dog[] | Error;

  /** Get a dog by ID */
  @get read(@path id: int64): Dog | Error;

  /** Create a new dog */
  @post create(@body dog: Dog): Dog | Error;
}
