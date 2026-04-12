// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Buffers;
using System.Collections.Generic;

namespace Microsoft.TypeSpec.Generator;

/// <summary>
/// Simple buffer sequence writer that avoids volatile/ref patterns and ArrayPool
/// that can cause SIGSEGV in sandboxed container environments.
/// </summary>
internal sealed partial class UnsafeBufferSequence : IBufferWriter<char>, IDisposable
{
    private readonly List<UnsafeBufferSegment> _segments = new();
    private readonly int _segmentSize;

    public UnsafeBufferSequence(int segmentSize = 16384)
    {
        _segmentSize = segmentSize;
    }

    public void Advance(int bytesWritten)
    {
        var last = _segments[_segments.Count - 1];
        last.Written += bytesWritten;
        _segments[_segments.Count - 1] = last;
        if (last.Written > last.Array.Length)
        {
            throw new ArgumentOutOfRangeException(nameof(bytesWritten));
        }
    }

    public Memory<char> GetMemory(int sizeHint = 0)
    {
        if (sizeHint < 256)
        {
            sizeHint = 256;
        }

        int sizeToRent = sizeHint > _segmentSize ? sizeHint : _segmentSize;

        if (_segments.Count == 0)
        {
            _segments.Add(new UnsafeBufferSegment { Array = new char[sizeToRent], Written = 0 });
        }

        var last = _segments[_segments.Count - 1];
        int remaining = last.Array.Length - last.Written;
        if (remaining >= sizeHint)
        {
            return last.Array.AsMemory(last.Written);
        }

        // Allocate a new segment
        _segments.Add(new UnsafeBufferSegment { Array = new char[sizeToRent], Written = 0 });
        return _segments[_segments.Count - 1].Array;
    }

    public Span<char> GetSpan(int sizeHint = 0)
    {
        Memory<char> memory = GetMemory(sizeHint);
        return memory.Span;
    }

    public void Dispose()
    {
        _segments.Clear();
    }

    public Reader ExtractReader()
    {
        var buffers = _segments.ToArray();
        var count = buffers.Length;
        _segments.Clear();
        return new ReaderInstance(buffers, count);
    }
}
