// <auto-generated/>

#nullable disable

using System;
using System.Collections.Generic;

namespace _Type.Model.Inheritance.SingleDiscriminator.Models
{
    public partial class Goose : Bird
    {
        public Goose(int wingspan) : base("goose", wingspan) => throw null;

        internal Goose(int wingspan, IDictionary<string, BinaryData> serializedAdditionalRawData) : base("goose", wingspan, serializedAdditionalRawData) => throw null;
    }
}
