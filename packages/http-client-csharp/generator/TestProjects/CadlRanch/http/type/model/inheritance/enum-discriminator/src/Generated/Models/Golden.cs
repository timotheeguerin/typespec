// <auto-generated/>

#nullable disable

using System;
using System.Collections.Generic;

namespace _Type.Model.Inheritance.EnumDiscriminator.Models
{
    public partial class Golden : Dog
    {
        public Golden(int weight) : base(DogKind.Golden, weight) => throw null;

        internal Golden(int weight, IDictionary<string, BinaryData> serializedAdditionalRawData) : base(DogKind.Golden, weight, serializedAdditionalRawData) => throw null;
    }
}
